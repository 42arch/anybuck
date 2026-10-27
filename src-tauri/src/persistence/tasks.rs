use crate::error::{AppError, ErrorCode};
use crate::storage::s3::copy::CopyCheckpoint;
use crate::transfers::model::{TransferTask, UploadConflictAction};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedTask {
    pub(crate) id: String,
    pub(crate) parent_id: Option<String>,
    pub(crate) operation: String,
    pub(crate) connection_id: String,
    pub(crate) bucket: String,
    pub(crate) display_name: String,
    pub(crate) object_key: String,
    #[serde(default)]
    pub(crate) destination_key: String,
    #[serde(default)]
    pub(crate) destination_connection_id: String,
    #[serde(default)]
    pub(crate) destination_bucket: String,
    pub(crate) local_path: String,
    pub(crate) relative_path: String,
    pub(crate) destination_root: String,
    pub(crate) status: String,
    #[serde(default)]
    pub(crate) phase: Option<String>,
    pub(crate) error: Option<String>,
    #[serde(default)]
    pub(crate) error_code: Option<String>,
    #[serde(default)]
    pub(crate) total_bytes: Option<u64>,
    #[serde(default)]
    pub(crate) transferred_bytes: u64,
    pub(crate) created_at: u64,
    pub(crate) updated_at: u64,
    #[serde(default)]
    pub(crate) upload_conflict_action: UploadConflictAction,
    pub(crate) overwrite: bool,
    #[serde(default)]
    pub(crate) checkpoint: Option<CopyCheckpoint>,
}

impl From<&TransferTask> for PersistedTask {
    fn from(task: &TransferTask) -> Self {
        Self {
            id: task.id.clone(),
            parent_id: task.parent_id.clone(),
            operation: task.operation.clone(),
            connection_id: task.connection_id.clone(),
            bucket: task.bucket.clone(),
            display_name: task.display_name.clone(),
            object_key: task.object_key.clone(),
            destination_key: task.destination_key.clone(),
            destination_connection_id: task.destination_connection_id.clone(),
            destination_bucket: task.destination_bucket.clone(),
            local_path: task.local_path.clone(),
            relative_path: task.relative_path.clone(),
            destination_root: task.destination_root.clone(),
            status: task.status.clone(),
            phase: task.phase.clone(),
            error: task.error.clone(),
            error_code: task.error_code.clone(),
            total_bytes: task.total_bytes,
            transferred_bytes: task.transferred_bytes,
            created_at: task.created_at,
            updated_at: task.updated_at,
            upload_conflict_action: task.upload_conflict_action,
            overwrite: task.overwrite,
            checkpoint: task.checkpoint.clone(),
        }
    }
}
pub(crate) fn load_tasks(path: &Path) -> Result<Vec<TransferTask>, AppError> {
    let backup_path = path.with_extension("json.bak");
    if !path.exists() && backup_path.exists() {
        fs::rename(&backup_path, path).map_err(|error| {
            AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
        })?;
    }
    let tasks: Vec<TransferTask> = if path.exists() {
        let data = fs::read(path).map_err(|error| {
            AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
        })?;
        serde_json::from_slice::<Vec<PersistedTask>>(&data)
            .map_err(|error| {
                AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
            })?
            .into_iter()
            .map(|task| TransferTask {
                id: task.id,
                parent_id: task.parent_id,
                operation: task.operation,
                connection_id: task.connection_id,
                bucket: task.bucket,
                display_name: task.display_name,
                object_key: task.object_key,
                destination_key: task.destination_key,
                destination_connection_id: task.destination_connection_id,
                destination_bucket: task.destination_bucket,
                local_path: task.local_path,
                relative_path: task.relative_path,
                destination_root: task.destination_root,
                status: task.status,
                phase: task.phase,
                error: task.error,
                error_code: task.error_code,
                total_bytes: task.total_bytes,
                transferred_bytes: task.transferred_bytes,
                created_at: task.created_at,
                updated_at: task.updated_at,
                upload_conflict_action: task.upload_conflict_action,
                overwrite: task.overwrite,
                checkpoint: task.checkpoint,
            })
            .collect()
    } else {
        Vec::new()
    };
    Ok(tasks)
}

pub(crate) fn save_tasks(path: &Path, tasks: &[TransferTask]) -> Result<(), AppError> {
    let data =
        serde_json::to_vec_pretty(&tasks.iter().map(PersistedTask::from).collect::<Vec<_>>())
            .map_err(|error| {
                AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
            })?;
    let temp_path = path.with_extension("json.tmp");
    let backup_path = path.with_extension("json.bak");
    fs::write(&temp_path, data).map_err(|error| {
        AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
    })?;
    if backup_path.exists() {
        fs::remove_file(&backup_path).map_err(|error| {
            AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
        })?;
    }
    if path.exists() {
        fs::rename(path, &backup_path).map_err(|error| {
            AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
        })?;
    }
    if let Err(error) = fs::rename(&temp_path, path) {
        if backup_path.exists() {
            let _ = fs::rename(&backup_path, path);
        }
        return Err(AppError::with_detail(
            ErrorCode::TransferHistoryFailed,
            error.to_string(),
        ));
    }
    if backup_path.exists() {
        fs::remove_file(&backup_path).map_err(|error| {
            AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::PersistedTask;
    use crate::storage::s3::copy::CopyCheckpoint;
    use crate::transfers::model::UploadConflictAction;

    #[test]
    fn transfer_history_keeps_move_checkpoint_and_reads_old_records() {
        let old_record = serde_json::json!({
            "id": "old-task",
            "parentId": null,
            "operation": "download",
            "connectionId": "connection",
            "bucket": "bucket",
            "displayName": "file.txt",
            "objectKey": "file.txt",
            "localPath": "/tmp/file.txt",
            "relativePath": "file.txt",
            "destinationRoot": "/tmp",
            "status": "completed",
            "error": null,
            "createdAt": 1,
            "updatedAt": 2,
            "overwrite": false
        });
        let old: PersistedTask = serde_json::from_value(old_record).unwrap();
        assert_eq!(old.destination_key, "");
        assert_eq!(old.destination_connection_id, "");
        assert_eq!(old.destination_bucket, "");
        assert!(old.checkpoint.is_none());
        assert!(old.error_code.is_none());
        assert_eq!(old.upload_conflict_action, UploadConflictAction::Skip);

        let mut move_task = old;
        move_task.operation = "move".to_string();
        move_task.destination_key = "new/file.txt".to_string();
        move_task.destination_connection_id = "destination".to_string();
        move_task.destination_bucket = "destination-bucket".to_string();
        move_task.phase = Some("deleting".to_string());
        move_task.checkpoint = Some(CopyCheckpoint {
            source_etag: "source".to_string(),
            target_etag: "target".to_string(),
            size: 42,
        });
        move_task.upload_conflict_action = UploadConflictAction::KeepBoth;
        move_task.error_code = Some("transferMoveFailed".to_string());
        let restored: PersistedTask =
            serde_json::from_slice(&serde_json::to_vec(&move_task).unwrap()).unwrap();
        assert_eq!(restored.destination_key, "new/file.txt");
        assert_eq!(restored.destination_connection_id, "destination");
        assert_eq!(restored.destination_bucket, "destination-bucket");
        assert_eq!(restored.phase.as_deref(), Some("deleting"));
        assert_eq!(restored.error_code.as_deref(), Some("transferMoveFailed"));
        assert_eq!(
            restored.upload_conflict_action,
            UploadConflictAction::KeepBoth
        );
        assert_eq!(restored.checkpoint.unwrap().target_etag, "target");
    }
}
