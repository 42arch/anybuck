use crate::connection::manager::{
    StorageConnectionState, client_for_connection, connections_share_bucket,
};
use crate::error::{AppError, ErrorCode};
use crate::storage::s3::copy;
use crate::transfers::manager::TransferManager;
use crate::transfers::model::{
    TransferTask, UploadConflictAction, is_folder_operation, is_terminal, make_id, new_task, now,
};
use crate::transfers::upload_planner::plan_uploads;
use crate::transfers::worker::spawn_task;
use std::{collections::HashSet, path::PathBuf};
use tauri::{AppHandle, Emitter, State};

pub(crate) fn list_transfer_tasks(
    state: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, AppError> {
    state
        .inner
        .tasks
        .lock()
        .map(|tasks| tasks.clone())
        .map_err(|_| AppError::new(ErrorCode::TransferListFailed))
}

pub(crate) async fn enqueue_uploads(
    app: AppHandle,
    connection_id: String,
    prefix: String,
    local_paths: Vec<String>,
    upload_conflict_action: UploadConflictAction,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, AppError> {
    if local_paths.is_empty() {
        return Ok(Vec::new());
    }
    let (client, bucket) = client_for_connection(&connection_id, connections.inner())?;
    let roots = tokio::task::spawn_blocking(move || plan_uploads(local_paths, &prefix))
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::TransferInvalidSource, error.to_string())
        })??;

    if upload_conflict_action != UploadConflictAction::KeepBoth {
        let mut names = HashSet::new();
        if roots
            .iter()
            .flat_map(|root| &root.items)
            .any(|item| !names.insert(&item.key))
        {
            return Err(AppError::new(ErrorCode::TransferDuplicateKeys));
        }
    }

    let mut tasks = Vec::new();
    let mut workers = Vec::new();
    for root in roots {
        let parent_id = if root.is_folder {
            let mut parent = new_task(
                None,
                "upload-folder",
                &connection_id,
                &bucket,
                &root.name,
                &format!("{}/", root.key),
                &root.local_path,
                false,
            );
            parent.total_bytes = Some(
                root.items
                    .iter()
                    .filter_map(|item| item.size)
                    .fold(0u64, u64::saturating_add),
            );
            let id = parent.id.clone();
            tasks.push(parent);
            Some(id)
        } else {
            None
        };
        for item in root.items {
            let mut task = new_task(
                parent_id.clone(),
                if item.size.is_some() {
                    "upload"
                } else {
                    "upload-marker"
                },
                &connection_id,
                &bucket,
                &item.name,
                &item.key,
                &item.local_path,
                true,
            );
            task.total_bytes = item.size;
            task.upload_conflict_action = upload_conflict_action;
            workers.push(task.clone());
            tasks.push(task);
        }
    }
    manager.add_tasks(&app, &tasks)?;
    for task in workers {
        spawn_task(
            app.clone(),
            manager.inner.clone(),
            task,
            client.clone(),
            bucket.clone(),
            None,
            None,
        );
    }
    Ok(tasks)
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn enqueue_object_operation(
    app: AppHandle,
    connection_id: String,
    destination_connection_id: Option<String>,
    keys: Vec<String>,
    destination_prefix: String,
    operation: String,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, AppError> {
    if !matches!(operation.as_str(), "copy" | "move") {
        return Err(AppError::new(ErrorCode::TransferInvalidOperation));
    }
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let destination_connection_id =
        destination_connection_id.unwrap_or_else(|| connection_id.clone());
    let (client, bucket) = client_for_connection(&connection_id, connections.inner())?;
    let (target_client, target_bucket) =
        client_for_connection(&destination_connection_id, connections.inner())?;
    let same_storage = connections_share_bucket(
        &connection_id,
        &destination_connection_id,
        connections.inner(),
    )?;
    let roots = copy::plan_object_operations(
        &client,
        &bucket,
        &target_client,
        &target_bucket,
        same_storage,
        keys,
        destination_prefix,
    )
    .await?;
    let mut created = Vec::new();
    for root in roots {
        let folder = root.source_root.ends_with('/');
        let task_operation = if folder {
            format!("{operation}-folder")
        } else {
            operation.clone()
        };
        let display_name = root
            .source_root
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("Object");
        let mut task = new_task(
            None,
            &task_operation,
            &connection_id,
            &bucket,
            display_name,
            &root.source_root,
            "",
            false,
        );
        task.destination_key = root.destination_root;
        task.destination_connection_id = destination_connection_id.clone();
        task.destination_bucket = target_bucket.clone();
        manager.add_task(&app, task.clone())?;
        if let Some(error) = root.error {
            manager.update_task(&app, &task.id, "failed", Some(error.clone()));
            task.status = "failed".to_string();
            task.error_code = Some(error.code_key());
            task.error = error.detail;
            created.push(task);
            continue;
        }
        created.push(task.clone());
        if folder {
            let mut children = Vec::new();
            for (source, destination) in root.objects {
                let name = source
                    .trim_end_matches('/')
                    .rsplit('/')
                    .next()
                    .unwrap_or("Object");
                let mut child = new_task(
                    Some(task.id.clone()),
                    &operation,
                    &connection_id,
                    &bucket,
                    name,
                    &source,
                    "",
                    false,
                );
                child.destination_key = destination;
                child.destination_connection_id = destination_connection_id.clone();
                child.destination_bucket = target_bucket.clone();
                manager.add_task(&app, child.clone())?;
                created.push(child.clone());
                children.push(child);
            }
            if children.is_empty() {
                manager.update_task(&app, &task.id, "completed", None);
            }
            for child in children {
                spawn_task(
                    app.clone(),
                    manager.inner.clone(),
                    child,
                    client.clone(),
                    bucket.clone(),
                    None,
                    Some((target_client.clone(), target_bucket.clone())),
                );
            }
        } else {
            spawn_task(
                app.clone(),
                manager.inner.clone(),
                task,
                client.clone(),
                bucket.clone(),
                None,
                Some((target_client.clone(), target_bucket.clone())),
            );
        }
    }
    Ok(created)
}

pub(crate) fn enqueue_download(
    app: AppHandle,
    plan_id: String,
    conflict_action: String,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, AppError> {
    if !matches!(conflict_action.as_str(), "overwrite" | "skip") {
        return Err(AppError::new(ErrorCode::TransferInvalidConflictAction));
    }
    let plan = manager
        .inner
        .plans
        .lock()
        .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?
        .remove(&plan_id)
        .ok_or_else(|| AppError::new(ErrorCode::TransferPlanFailed))?;
    let (client, bucket) = client_for_connection(&plan.connection_id, connections.inner())?;
    let mut tasks = Vec::new();
    for parent in plan.parents {
        manager.add_task(&app, parent.clone())?;
        tasks.push(parent);
    }
    for item in plan.files {
        let exists = item.local_path.exists();
        let mut task = new_task(
            item.parent_id,
            "download",
            &plan.connection_id,
            &bucket,
            &item.display_name,
            &item.object_key,
            &item.local_path.to_string_lossy(),
            conflict_action == "overwrite",
        );
        task.relative_path = item.relative_path;
        task.destination_root = plan.destination_root.to_string_lossy().to_string();
        manager.add_task(&app, task.clone())?;
        if exists && conflict_action == "skip" {
            manager.update_task(&app, &task.id, "skipped", None);
        } else {
            let root = plan.destination_root.clone();
            spawn_task(
                app.clone(),
                manager.inner.clone(),
                task.clone(),
                client.clone(),
                bucket.clone(),
                Some(root),
                None,
            );
        }
        tasks.push(task);
    }
    let parent_ids: Vec<_> = tasks
        .iter()
        .filter(|task| task.operation == "folder")
        .map(|task| task.id.clone())
        .collect();
    for parent_id in parent_ids {
        let has_children = manager
            .inner
            .tasks
            .lock()
            .map(|items| {
                items
                    .iter()
                    .any(|item| item.parent_id.as_deref() == Some(parent_id.as_str()))
            })
            .unwrap_or(true);
        if !has_children {
            manager.update_task(&app, &parent_id, "completed", None);
        }
    }
    Ok(tasks)
}

pub(crate) fn cancel_transfer_task(
    app: AppHandle,
    task_id: String,
    manager: State<'_, TransferManager>,
) -> Result<(), AppError> {
    let child_ids: Vec<String> = {
        let tasks = manager
            .inner
            .tasks
            .lock()
            .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?;
        let Some(task) = tasks.iter().find(|task| task.id == task_id) else {
            return Err(AppError::new(ErrorCode::TransferTaskNotFound));
        };
        if task.parent_id.is_none() && is_folder_operation(&task.operation) {
            tasks
                .iter()
                .filter(|item| {
                    item.parent_id.as_deref() == Some(task_id.as_str())
                        && matches!(item.status.as_str(), "queued" | "running")
                })
                .map(|item| item.id.clone())
                .collect()
        } else {
            vec![task_id.clone()]
        }
    };
    for id in child_ids {
        let active = manager
            .inner
            .tasks
            .lock()
            .map(|tasks| {
                tasks
                    .iter()
                    .find(|task| task.id == id)
                    .filter(|task| matches!(task.status.as_str(), "queued" | "running"))
                    .map(|task| {
                        (
                            task.status == "running",
                            matches!(task.operation.as_str(), "copy" | "move"),
                        )
                    })
            })
            .unwrap_or(None);
        let Some((was_running, is_cloud_copy)) = active else {
            continue;
        };
        if let Ok(handles) = manager.inner.handles.lock()
            && let Some(handle) = handles.get(&id)
        {
            handle.abort();
        }
        if let Ok(mut handles) = manager.inner.handles.lock() {
            handles.remove(&id);
        }
        let warning = if was_running && is_cloud_copy {
            Some(AppError::new(ErrorCode::TransferOutcomeUncertain))
        } else {
            None
        };
        manager.update_task(&app, &id, "cancelled", warning);
    }
    Ok(())
}

pub(crate) fn retry_transfer_task(
    app: AppHandle,
    task_id: String,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<TransferTask, AppError> {
    let original = manager
        .inner
        .tasks
        .lock()
        .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?
        .iter()
        .find(|task| task.id == task_id)
        .cloned()
        .ok_or_else(|| AppError::new(ErrorCode::TransferTaskNotFound))?;
    if is_folder_operation(&original.operation) {
        return Err(AppError::new(ErrorCode::TransferRetryNotAllowed));
    }
    if matches!(original.operation.as_str(), "copy" | "move") && original.phase.is_none() {
        return Err(AppError::new(ErrorCode::TransferRetryNotAllowed));
    }
    if !matches!(
        original.status.as_str(),
        "failed" | "cancelled" | "interrupted"
    ) {
        return Err(AppError::new(ErrorCode::TransferRetryNotAllowed));
    }
    let (client, bucket) = client_for_connection(&original.connection_id, connections.inner())?;
    if !original.bucket.is_empty() && original.bucket != bucket {
        return Err(AppError::new(ErrorCode::TransferBucketChanged));
    }
    let target = if matches!(original.operation.as_str(), "copy" | "move") {
        let target_id = if original.destination_connection_id.is_empty() {
            &original.connection_id
        } else {
            &original.destination_connection_id
        };
        Some(client_for_connection(target_id, connections.inner())?)
    } else {
        None
    };
    if let Some((_, target_bucket)) = &target
        && !original.destination_bucket.is_empty()
        && original.destination_bucket.as_str() != target_bucket
    {
        return Err(AppError::new(ErrorCode::TransferDestinationBucketChanged));
    }
    let mut retry = original.clone();
    retry.id = make_id();
    retry.parent_id = None;
    retry.status = "queued".to_string();
    retry.error = None;
    retry.error_code = None;
    retry.transferred_bytes = if retry.operation == "move" && retry.checkpoint.is_some() {
        retry.total_bytes.unwrap_or(0)
    } else {
        0
    };
    retry.created_at = now();
    retry.updated_at = retry.created_at;
    manager.add_task(&app, retry.clone())?;
    let root = if retry.operation == "download" {
        Some(PathBuf::from(&retry.destination_root))
    } else {
        None
    };
    spawn_task(
        app,
        manager.inner.clone(),
        retry.clone(),
        client,
        bucket,
        root,
        target,
    );
    Ok(retry)
}

pub(crate) fn clear_transfer_history(
    app: AppHandle,
    manager: State<'_, TransferManager>,
) -> Result<(), AppError> {
    let mut tasks = manager
        .inner
        .tasks
        .lock()
        .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?;
    let removed: std::collections::HashSet<_> = tasks
        .iter()
        .filter(|task| task.parent_id.is_none() && is_terminal(&task.status))
        .map(|task| task.id.clone())
        .collect();
    tasks.retain(|task| {
        !is_terminal(&task.status)
            || !task
                .parent_id
                .as_ref()
                .is_some_and(|id| removed.contains(id))
                && !removed.contains(&task.id)
    });
    drop(tasks);
    manager.persist()?;
    let _ = app.emit("transfer-history-cleared", ());
    Ok(())
}
