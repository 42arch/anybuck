use crate::connection::manager::{R2ConnectionState, client_for_connection};
use crate::transfers::manager::TransferManager;
use crate::transfers::model::{DownloadPlanSummary, TransferTask, make_id, new_task};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, State};

#[derive(Clone)]
pub(crate) struct PlannedDownload {
    pub(crate) parent_id: Option<String>,
    pub(crate) display_name: String,
    pub(crate) object_key: String,
    pub(crate) local_path: PathBuf,
    pub(crate) relative_path: String,
}

#[derive(Clone)]
pub(crate) struct DownloadPlan {
    pub(crate) connection_id: String,
    pub(crate) destination_root: PathBuf,
    pub(crate) files: Vec<PlannedDownload>,
    pub(crate) parents: Vec<TransferTask>,
}
pub(crate) async fn prepare_r2_download(
    app: AppHandle,
    connection_id: String,
    prefix: String,
    keys: Vec<String>,
    destination_path: String,
    connections: State<'_, R2ConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<DownloadPlanSummary, String> {
    if keys.is_empty() {
        return Err("请先选择要下载的文件或文件夹。".to_string());
    }
    let (client, bucket) = client_for_connection(&connection_id, connections.inner())?;
    let root = PathBuf::from(destination_path)
        .canonicalize()
        .map_err(|error| format!("无法访问所选下载目录：{error}"))?;
    if !root.is_dir() {
        return Err("所选下载位置不是目录。".to_string());
    }
    let normalized_prefix = if prefix.trim_matches('/').is_empty() {
        String::new()
    } else {
        format!("{}/", prefix.trim_matches('/'))
    };
    let mut parents = Vec::new();
    let mut files = HashMap::<String, PlannedDownload>::new();
    for key in keys {
        if !key.starts_with(&normalized_prefix) {
            return Err("所选对象不属于当前目录。".to_string());
        }
        let parent_id = if key.ends_with('/') {
            let folder_name = key
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .unwrap_or("文件夹");
            let parent = new_task(
                None,
                "folder",
                &connection_id,
                &bucket,
                folder_name,
                &key,
                "",
                true,
            );
            let id = parent.id.clone();
            parents.push(parent);
            let mut token = None;
            loop {
                let mut request = client
                    .list_objects_v2()
                    .bucket(&bucket)
                    .prefix(&key)
                    .max_keys(100);
                if let Some(value) = token.as_deref() {
                    request = request.continuation_token(value);
                }
                let page = request
                    .send()
                    .await
                    .map_err(|error| format!("读取文件夹失败：{error}"))?;
                for object in page.contents() {
                    let Some(object_key) = object.key().filter(|value| !value.ends_with('/'))
                    else {
                        continue;
                    };
                    let Some(relative) = object_key.strip_prefix(&normalized_prefix) else {
                        continue;
                    };
                    let name = relative.rsplit('/').next().unwrap_or(relative).to_string();
                    let local = safe_local_path(&root, relative)?;
                    files.insert(
                        object_key.to_string(),
                        PlannedDownload {
                            parent_id: Some(id.clone()),
                            display_name: name,
                            object_key: object_key.to_string(),
                            local_path: local,
                            relative_path: relative.to_string(),
                        },
                    );
                }
                token = page.next_continuation_token().map(ToOwned::to_owned);
                if token.is_none() {
                    break;
                }
            }
            Some(id)
        } else {
            None
        };
        if !key.ends_with('/') {
            let relative = key
                .strip_prefix(&normalized_prefix)
                .ok_or_else(|| "所选对象不属于当前目录。".to_string())?;
            let name = relative.rsplit('/').next().unwrap_or(relative).to_string();
            let local = safe_local_path(&root, relative)?;
            files.insert(
                key.clone(),
                PlannedDownload {
                    parent_id,
                    display_name: name,
                    object_key: key.clone(),
                    local_path: local,
                    relative_path: relative.to_string(),
                },
            );
        }
    }
    let files: Vec<_> = files.into_values().collect();
    let conflicts: Vec<_> = files
        .iter()
        .filter(|file| file.local_path.exists())
        .map(|file| file.display_name.clone())
        .collect();
    let plan_id = make_id();
    manager
        .inner
        .plans
        .lock()
        .map_err(|_| "传输状态不可用。".to_string())?
        .insert(
            plan_id.clone(),
            DownloadPlan {
                connection_id,
                destination_root: root,
                files: files.clone(),
                parents,
            },
        );
    let summary = DownloadPlanSummary {
        plan_id,
        conflicts,
        file_count: files.len(),
    };
    let _ = app;
    Ok(summary)
}

fn safe_local_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut path = root.to_path_buf();
    for component in relative.trim_end_matches('/').split('/') {
        if component.is_empty()
            || component == "."
            || component == ".."
            || component.chars().any(|ch| matches!(ch, '\\' | ':' | '\0'))
        {
            return Err("对象 Key 包含不安全的本地路径。".to_string());
        }
        path.push(component);
    }
    if !path.starts_with(root) {
        return Err("对象 Key 指向下载目录之外的路径。".to_string());
    }
    Ok(path)
}
