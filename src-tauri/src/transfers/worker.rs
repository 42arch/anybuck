use crate::storage::s3::{
    copy, migrate,
    transfer::{ProgressCallback, UploadOutcome, download_file, upload_file, upload_folder_marker},
};
use crate::transfers::manager::{TransferManager, TransferManagerInner};
use crate::transfers::model::TransferTask;
use aws_sdk_s3::Client;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::AppHandle;

pub(crate) fn spawn_task(
    app: AppHandle,
    inner: Arc<TransferManagerInner>,
    task: TransferTask,
    client: Client,
    bucket: String,
    download_root: Option<PathBuf>,
    target: Option<(Client, String)>,
) {
    let manager = TransferManager {
        inner: inner.clone(),
    };
    let id = task.id.clone();
    let task_inner = inner.clone();
    let worker_task = task.clone();
    let handle_id = id.clone();
    let (start_tx, start_rx) = tokio::sync::oneshot::channel();
    let handle = tauri::async_runtime::spawn(async move {
        if start_rx.await.is_err() {
            return;
        }
        let Ok(_permit) = task_inner.semaphore.clone().acquire_owned().await else {
            return;
        };
        manager.update_task(&app, &id, "running", None);
        let progress_manager = manager.clone();
        let progress_app = app.clone();
        let progress_id = id.clone();
        let on_progress: ProgressCallback = Arc::new(move |transferred, total| {
            progress_manager.update_progress(&progress_app, &progress_id, transferred, total);
        });
        let result = if matches!(worker_task.operation.as_str(), "copy" | "move") {
            let operation = async {
                let (target_client, target_bucket) = target
                    .as_ref()
                    .map(|(client, bucket)| (client, bucket))
                    .unwrap_or((&client, &bucket));
                let checkpoint = if let Some(checkpoint) = worker_task.checkpoint.clone() {
                    checkpoint
                } else {
                    manager.update_phase(&app, &id, "copying");
                    let checkpoint = if worker_task.destination_connection_id.is_empty()
                        || worker_task.destination_connection_id == worker_task.connection_id
                    {
                        copy::copy_only(
                            &client,
                            &bucket,
                            &worker_task.object_key,
                            &worker_task.destination_key,
                            Some(on_progress.as_ref()),
                        )
                        .await?
                    } else {
                        let phase_manager = manager.clone();
                        let phase_app = app.clone();
                        let phase_id = id.clone();
                        let on_phase = move |phase: &str| {
                            phase_manager.update_phase(&phase_app, &phase_id, phase);
                        };
                        migrate::copy_across_connections(
                            &client,
                            &bucket,
                            &worker_task.object_key,
                            target_client,
                            target_bucket,
                            &worker_task.destination_key,
                            &id,
                            worker_task.operation == "move",
                            &on_progress,
                            &on_phase,
                        )
                        .await?
                    };
                    if worker_task.operation == "move" {
                        manager.save_checkpoint(&app, &id, checkpoint.clone())?;
                    }
                    checkpoint
                };
                if worker_task.operation == "move" {
                    manager.update_phase(&app, &id, "deleting");
                    copy::finish_move(
                        &client,
                        &bucket,
                        target_client,
                        target_bucket,
                        &worker_task.object_key,
                        &worker_task.destination_key,
                        &checkpoint,
                    )
                    .await?;
                }
                Ok::<bool, String>(true)
            };
            operation.await.map(|success| (success, None))
        } else if matches!(worker_task.operation.as_str(), "upload" | "upload-marker") {
            let upload = if worker_task.operation == "upload" {
                upload_file(
                    &client,
                    &bucket,
                    &worker_task.object_key_prefix(),
                    Path::new(&worker_task.local_path),
                    worker_task.upload_conflict_action,
                    on_progress,
                )
                .await
            } else {
                upload_folder_marker(
                    &client,
                    &bucket,
                    &worker_task.object_key,
                    Path::new(&worker_task.local_path),
                    worker_task.upload_conflict_action,
                )
                .await
            };
            upload.map(|outcome| match outcome {
                UploadOutcome::Uploaded(key) => (true, Some(key)),
                UploadOutcome::Skipped => (false, None),
            })
        } else {
            let root = download_root.as_deref().unwrap_or_else(|| {
                Path::new(&worker_task.local_path)
                    .parent()
                    .unwrap_or(Path::new("."))
            });
            download_file(
                &client,
                &bucket,
                &worker_task.object_key,
                &worker_task.relative_path,
                root,
                worker_task.overwrite,
                on_progress,
            )
            .await
            .map(|success| (success, None))
        };
        match result {
            Ok((true, Some(key))) => manager.complete_upload(&app, &id, key),
            Ok((true, None)) => manager.update_task(&app, &id, "completed", None),
            Ok((false, _)) => manager.update_task(&app, &id, "skipped", None),
            Err(error) => manager.update_task(&app, &id, "failed", Some(error)),
        }
        if let Ok(mut handles) = task_inner.handles.lock() {
            handles.remove(&id);
        }
    });
    if let Ok(mut handles) = inner.handles.lock() {
        handles.insert(handle_id, handle);
        let _ = start_tx.send(());
    } else {
        handle.abort();
    }
}
