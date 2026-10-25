use crate::storage::s3::copy::CopyCheckpoint;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UploadConflictAction {
    #[default]
    Skip,
    Overwrite,
    KeepBoth,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferTask {
    pub id: String,
    pub parent_id: Option<String>,
    pub operation: String,
    pub connection_id: String,
    pub bucket: String,
    pub display_name: String,
    pub object_key: String,
    pub destination_key: String,
    #[serde(default)]
    pub destination_connection_id: String,
    #[serde(default)]
    pub destination_bucket: String,
    pub local_path: String,
    pub relative_path: String,
    pub destination_root: String,
    pub status: String,
    pub phase: Option<String>,
    pub error: Option<String>,
    pub total_bytes: Option<u64>,
    pub transferred_bytes: u64,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub upload_conflict_action: UploadConflictAction,
    #[serde(skip)]
    pub overwrite: bool,
    #[serde(skip)]
    pub checkpoint: Option<CopyCheckpoint>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPlanSummary {
    pub(crate) plan_id: String,
    pub(crate) conflicts: Vec<String>,
    pub(crate) file_count: usize,
}

impl TransferTask {
    pub(crate) fn object_key_prefix(&self) -> String {
        self.object_key
            .rsplit_once('/')
            .map(|(prefix, _)| prefix.to_string())
            .unwrap_or_default()
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn new_task(
    parent_id: Option<String>,
    operation: &str,
    connection_id: &str,
    bucket: &str,
    name: &str,
    key: &str,
    path: &str,
    overwrite: bool,
) -> TransferTask {
    let timestamp = now();
    TransferTask {
        id: make_id(),
        parent_id,
        operation: operation.to_string(),
        connection_id: connection_id.to_string(),
        bucket: bucket.to_string(),
        display_name: name.to_string(),
        object_key: key.to_string(),
        local_path: path.to_string(),
        relative_path: key
            .rsplit_once('/')
            .map(|(_, file)| file.to_string())
            .unwrap_or_else(|| key.to_string()),
        destination_root: String::new(),
        destination_key: String::new(),
        destination_connection_id: String::new(),
        destination_bucket: String::new(),
        status: "queued".to_string(),
        phase: None,
        error: None,
        total_bytes: None,
        transferred_bytes: 0,
        created_at: timestamp,
        updated_at: timestamp,
        upload_conflict_action: UploadConflictAction::Skip,
        overwrite,
        checkpoint: None,
    }
}

pub(crate) fn make_id() -> String {
    format!("{}-{}", now(), NEXT_ID.fetch_add(1, Ordering::Relaxed))
}

pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub(crate) fn is_terminal(status: &str) -> bool {
    matches!(
        status,
        "completed" | "failed" | "cancelled" | "interrupted" | "skipped"
    )
}

pub(crate) fn is_folder_operation(operation: &str) -> bool {
    matches!(
        operation,
        "folder" | "upload-folder" | "copy-folder" | "move-folder"
    )
}
