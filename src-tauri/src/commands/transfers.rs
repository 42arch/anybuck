use crate::connection::manager::{StorageConnectionState, client_for_connection};
use crate::error::AppError;
use crate::storage::s3::objects::DownloadObjectsResult;
use crate::storage::s3::transfer::{self, upload_file as s3_upload_file};
use crate::transfers::planner;
use crate::transfers::service;
use crate::transfers::{
    manager::TransferManager,
    model::{DownloadPlanSummary, TransferTask, UploadConflictAction},
};
use std::{path::Path, sync::Arc};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn upload_file(
    connection_id: String,
    prefix: String,
    local_path: String,
    state: State<'_, StorageConnectionState>,
) -> Result<(), AppError> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    s3_upload_file(
        &client,
        &bucket,
        &prefix,
        Path::new(&local_path),
        UploadConflictAction::Skip,
        Arc::new(|_, _| {}),
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub async fn download_objects(
    connection_id: String,
    prefix: String,
    keys: Vec<String>,
    destination_path: String,
    state: State<'_, StorageConnectionState>,
) -> Result<DownloadObjectsResult, AppError> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    transfer::download_objects(&client, &bucket, prefix, keys, destination_path).await
}

#[tauri::command]
pub fn list_transfer_tasks(
    state: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, AppError> {
    service::list_transfer_tasks(state)
}

#[tauri::command]
pub async fn enqueue_uploads(
    app: AppHandle,
    connection_id: String,
    prefix: String,
    local_paths: Vec<String>,
    upload_conflict_action: UploadConflictAction,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, AppError> {
    service::enqueue_uploads(
        app,
        connection_id,
        prefix,
        local_paths,
        upload_conflict_action,
        connections,
        manager,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn enqueue_object_operation(
    app: AppHandle,
    connection_id: String,
    destination_connection_id: Option<String>,
    keys: Vec<String>,
    destination_prefix: String,
    operation: String,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, AppError> {
    service::enqueue_object_operation(
        app,
        connection_id,
        destination_connection_id,
        keys,
        destination_prefix,
        operation,
        connections,
        manager,
    )
    .await
}

#[tauri::command]
pub async fn prepare_download(
    app: AppHandle,
    connection_id: String,
    prefix: String,
    keys: Vec<String>,
    destination_path: String,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<DownloadPlanSummary, AppError> {
    planner::prepare_download(
        app,
        connection_id,
        prefix,
        keys,
        destination_path,
        connections,
        manager,
    )
    .await
}

#[tauri::command]
pub fn enqueue_download(
    app: AppHandle,
    plan_id: String,
    conflict_action: String,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<Vec<TransferTask>, AppError> {
    service::enqueue_download(app, plan_id, conflict_action, connections, manager)
}

#[tauri::command]
pub fn cancel_transfer_task(
    app: AppHandle,
    task_id: String,
    manager: State<'_, TransferManager>,
) -> Result<(), AppError> {
    service::cancel_transfer_task(app, task_id, manager)
}

#[tauri::command]
pub fn retry_transfer_task(
    app: AppHandle,
    task_id: String,
    connections: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<TransferTask, AppError> {
    service::retry_transfer_task(app, task_id, connections, manager)
}

#[tauri::command]
pub fn clear_transfer_history(
    app: AppHandle,
    manager: State<'_, TransferManager>,
) -> Result<(), AppError> {
    service::clear_transfer_history(app, manager)
}
