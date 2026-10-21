use crate::connection::manager::{R2ConnectionState, client_for_connection};
use crate::storage::s3::copy;
use crate::transfers::manager::TransferManager;
use crate::transfers::model::{
    TransferTask, is_folder_operation, is_terminal, make_id, new_task, now,
};
use crate::transfers::worker::spawn_task;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Emitter, State};

pub(crate) fn list_transfer_tasks(
    state: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, String> {
    state
        .inner
        .tasks
        .lock()
        .map(|tasks| tasks.clone())
        .map_err(|_| "传输状态不可用。".to_string())
}

pub(crate) async fn enqueue_r2_uploads(
    app: AppHandle,
    connection_id: String,
    prefix: String,
    local_paths: Vec<String>,
    connections: State<'_, R2ConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, String> {
    if local_paths.is_empty() {
        return Ok(Vec::new());
    }
    let (client, bucket) = client_for_connection(&connection_id, connections.inner())?;
    let mut tasks = Vec::new();
    for local_path in local_paths {
        let path = PathBuf::from(&local_path);
        let metadata = fs::metadata(&path).map_err(|error| format!("无法读取所选文件：{error}"))?;
        if !metadata.is_file() {
            return Err(format!("所选路径不是文件：{}", path.display()));
        }
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "无法读取所选文件名。".to_string())?;
        let key = if prefix.trim_matches('/').is_empty() {
            file_name.to_string()
        } else {
            format!("{}/{file_name}", prefix.trim_matches('/'))
        };
        let mut task = new_task(
            None,
            "upload",
            &connection_id,
            &bucket,
            file_name,
            &key,
            &local_path,
            true,
        );
        task.total_bytes = Some(metadata.len());
        manager.add_task(&app, task.clone())?;
        spawn_task(
            app.clone(),
            manager.inner.clone(),
            task.clone(),
            client.clone(),
            bucket.clone(),
            None,
        );
        tasks.push(task);
    }
    Ok(tasks)
}

pub(crate) async fn enqueue_r2_object_operation(
    app: AppHandle,
    connection_id: String,
    keys: Vec<String>,
    destination_prefix: String,
    operation: String,
    connections: State<'_, R2ConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, String> {
    if !matches!(operation.as_str(), "copy" | "move") {
        return Err("无效的对象操作。".to_string());
    }
    if keys.is_empty() {
        return Ok(Vec::new());
    }
    let (client, bucket) = client_for_connection(&connection_id, connections.inner())?;
    let roots = copy::plan_object_operations(&client, &bucket, keys, destination_prefix).await?;
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
            .unwrap_or("对象");
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
        manager.add_task(&app, task.clone())?;
        created.push(task.clone());
        if let Some(error) = root.error {
            manager.update_task(&app, &task.id, "failed", Some(error));
            continue;
        }
        if folder {
            let mut children = Vec::new();
            for (source, destination) in root.objects {
                let name = source
                    .trim_end_matches('/')
                    .rsplit('/')
                    .next()
                    .unwrap_or("对象");
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
            );
        }
    }
    Ok(created)
}

pub(crate) fn enqueue_r2_download(
    app: AppHandle,
    plan_id: String,
    conflict_action: String,
    connections: State<'_, R2ConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, String> {
    if !matches!(conflict_action.as_str(), "overwrite" | "skip") {
        return Err("无效的文件冲突处理方式。".to_string());
    }
    let plan = manager
        .inner
        .plans
        .lock()
        .map_err(|_| "传输状态不可用。".to_string())?
        .remove(&plan_id)
        .ok_or_else(|| "下载计划已过期，请重新选择文件。".to_string())?;
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
) -> Result<(), String> {
    let child_ids: Vec<String> = {
        let tasks = manager
            .inner
            .tasks
            .lock()
            .map_err(|_| "传输状态不可用。".to_string())?;
        let Some(task) = tasks.iter().find(|task| task.id == task_id) else {
            return Err("找不到传输任务。".to_string());
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
            Some("云端请求可能已完成，请检查源位置与目标位置后再重试。".to_string())
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
    connections: State<'_, R2ConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<TransferTask, String> {
    let original = manager
        .inner
        .tasks
        .lock()
        .map_err(|_| "传输状态不可用。".to_string())?
        .iter()
        .find(|task| task.id == task_id)
        .cloned()
        .ok_or_else(|| "找不到传输任务。".to_string())?;
    if is_folder_operation(&original.operation) {
        return Err("请在文件夹任务中重试失败的文件。".to_string());
    }
    if matches!(original.operation.as_str(), "copy" | "move") && original.phase.is_none() {
        return Err("请重新选择目标位置并创建任务。".to_string());
    }
    if !matches!(
        original.status.as_str(),
        "failed" | "cancelled" | "interrupted"
    ) {
        return Err("只有失败、中断或已取消的任务可以重试。".to_string());
    }
    let (client, bucket) = client_for_connection(&original.connection_id, connections.inner())?;
    let mut retry = original.clone();
    retry.id = make_id();
    retry.parent_id = None;
    retry.status = "queued".to_string();
    retry.error = None;
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
    );
    Ok(retry)
}

pub(crate) fn clear_transfer_history(
    app: AppHandle,
    manager: State<'_, TransferManager>,
) -> Result<(), String> {
    let mut tasks = manager
        .inner
        .tasks
        .lock()
        .map_err(|_| "传输状态不可用。".to_string())?;
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
