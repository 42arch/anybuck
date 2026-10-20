use super::r2::{self, R2ConnectionState};
use aws_sdk_s3::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State, async_runtime::JoinHandle};
use tokio::sync::Semaphore;

const EVENT_NAME: &str = "transfer-task-updated";
const MAX_PARALLEL_TRANSFERS: usize = 2;
const MAX_TERMINAL_TASKS: usize = 100;
const TASKS_FILE: &str = "transfers.json";
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

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
    pub local_path: String,
    pub relative_path: String,
    pub destination_root: String,
    pub status: String,
    pub error: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(skip)]
    pub overwrite: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedTask {
    id: String,
    parent_id: Option<String>,
    operation: String,
    connection_id: String,
    bucket: String,
    display_name: String,
    object_key: String,
    local_path: String,
    relative_path: String,
    destination_root: String,
    status: String,
    error: Option<String>,
    created_at: u64,
    updated_at: u64,
    overwrite: bool,
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
            local_path: task.local_path.clone(),
            relative_path: task.relative_path.clone(),
            destination_root: task.destination_root.clone(),
            status: task.status.clone(),
            error: task.error.clone(),
            created_at: task.created_at,
            updated_at: task.updated_at,
            overwrite: task.overwrite,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPlanSummary {
    plan_id: String,
    conflicts: Vec<String>,
    file_count: usize,
}

#[derive(Clone)]
struct PlannedDownload {
    parent_id: Option<String>,
    display_name: String,
    object_key: String,
    local_path: PathBuf,
    relative_path: String,
}

#[derive(Clone)]
struct DownloadPlan {
    connection_id: String,
    destination_root: PathBuf,
    files: Vec<PlannedDownload>,
    parents: Vec<TransferTask>,
}

#[derive(Clone)]
pub struct TransferManager {
    inner: Arc<TransferManagerInner>,
}

struct TransferManagerInner {
    tasks: Mutex<Vec<TransferTask>>,
    persist_lock: Mutex<()>,
    handles: Mutex<HashMap<String, JoinHandle<()>>>,
    plans: Mutex<HashMap<String, DownloadPlan>>,
    semaphore: Arc<Semaphore>,
    storage_path: PathBuf,
}

impl TransferManager {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法获取应用数据目录：{error}"))?;
        fs::create_dir_all(&directory).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
        let storage_path = directory.join(TASKS_FILE);
        let backup_path = storage_path.with_extension("json.bak");
        if !storage_path.exists() && backup_path.exists() {
            fs::rename(&backup_path, &storage_path)
                .map_err(|error| format!("无法恢复传输记录：{error}"))?;
        }
        let mut tasks: Vec<TransferTask> = if storage_path.exists() {
            let data =
                fs::read(&storage_path).map_err(|error| format!("无法读取传输记录：{error}"))?;
            serde_json::from_slice::<Vec<PersistedTask>>(&data)
                .map_err(|error| format!("无法解析传输记录：{error}"))?
                .into_iter()
                .map(|task| TransferTask {
                    id: task.id,
                    parent_id: task.parent_id,
                    operation: task.operation,
                    connection_id: task.connection_id,
                    bucket: task.bucket,
                    display_name: task.display_name,
                    object_key: task.object_key,
                    local_path: task.local_path,
                    relative_path: task.relative_path,
                    destination_root: task.destination_root,
                    status: task.status,
                    error: task.error,
                    created_at: task.created_at,
                    updated_at: task.updated_at,
                    overwrite: task.overwrite,
                })
                .collect()
        } else {
            Vec::new()
        };
        for task in &mut tasks {
            if task.status == "running" || task.status == "queued" {
                task.status = "interrupted".to_string();
                task.error = Some("应用关闭时任务尚未完成，请手动重试。".to_string());
                task.updated_at = now();
            }
        }
        let manager = Self {
            inner: Arc::new(TransferManagerInner {
                tasks: Mutex::new(tasks),
                persist_lock: Mutex::new(()),
                handles: Mutex::new(HashMap::new()),
                plans: Mutex::new(HashMap::new()),
                semaphore: Arc::new(Semaphore::new(MAX_PARALLEL_TRANSFERS)),
                storage_path,
            }),
        };
        manager.persist()?;
        Ok(manager)
    }

    fn persist(&self) -> Result<(), String> {
        let _persist_guard = self
            .inner
            .persist_lock
            .lock()
            .map_err(|_| "传输状态不可用。".to_string())?;
        let tasks = self
            .inner
            .tasks
            .lock()
            .map_err(|_| "传输状态不可用。".to_string())?;
        let data =
            serde_json::to_vec_pretty(&tasks.iter().map(PersistedTask::from).collect::<Vec<_>>())
                .map_err(|error| format!("无法序列化传输记录：{error}"))?;
        let temp_path = self.inner.storage_path.with_extension("json.tmp");
        let backup_path = self.inner.storage_path.with_extension("json.bak");
        fs::write(&temp_path, data).map_err(|error| format!("无法保存传输记录：{error}"))?;
        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|error| format!("无法清理传输记录备份：{error}"))?;
        }
        if self.inner.storage_path.exists() {
            fs::rename(&self.inner.storage_path, &backup_path)
                .map_err(|error| format!("无法备份传输记录：{error}"))?;
        }
        if let Err(error) = fs::rename(&temp_path, &self.inner.storage_path) {
            if backup_path.exists() {
                let _ = fs::rename(&backup_path, &self.inner.storage_path);
            }
            return Err(format!("无法更新传输记录：{error}"));
        }
        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|error| format!("无法清理传输记录备份：{error}"))?;
        }
        Ok(())
    }

    fn emit(&self, app: &AppHandle, task: &TransferTask) {
        let _ = app.emit(EVENT_NAME, task);
    }

    fn add_task(&self, app: &AppHandle, task: TransferTask) -> Result<(), String> {
        {
            let mut tasks = self
                .inner
                .tasks
                .lock()
                .map_err(|_| "传输状态不可用。".to_string())?;
            tasks.push(task.clone());
        }
        self.persist()?;
        self.emit(app, &task);
        Ok(())
    }

    fn update_task(&self, app: &AppHandle, id: &str, status: &str, error: Option<String>) {
        let mut changed = Vec::new();
        if let Ok(mut tasks) = self.inner.tasks.lock()
            && let Some(task) = tasks.iter_mut().find(|task| task.id == id)
        {
            task.status = status.to_string();
            task.error = error;
            task.updated_at = now();
            changed.push(task.clone());
            if let Some(parent_id) = task.parent_id.clone() {
                let children: Vec<_> = tasks
                    .iter()
                    .filter(|child| child.parent_id.as_deref() == Some(parent_id.as_str()))
                    .map(|child| child.status.clone())
                    .collect();
                if let Some(parent) = tasks.iter_mut().find(|item| item.id == parent_id) {
                    if children.iter().all(|status| is_terminal(status)) {
                        parent.status = if children.iter().any(|status| status == "failed") {
                            "failed".to_string()
                        } else if children.iter().any(|status| status == "cancelled") {
                            "cancelled".to_string()
                        } else {
                            "completed".to_string()
                        };
                    } else if children.iter().any(|status| status == "running") {
                        parent.status = "running".to_string();
                    }
                    parent.updated_at = now();
                    changed.push(parent.clone());
                }
            }
        }
        let _ = self.persist();
        self.prune();
        for task in changed {
            self.emit(app, &task);
        }
    }

    fn prune(&self) {
        if let Ok(mut tasks) = self.inner.tasks.lock() {
            let mut terminal_roots: Vec<_> = tasks
                .iter()
                .filter(|task| task.parent_id.is_none() && is_terminal(&task.status))
                .map(|task| (task.id.clone(), task.updated_at))
                .collect();
            terminal_roots.sort_by_key(|(_, updated_at)| std::cmp::Reverse(*updated_at));
            let retained: std::collections::HashSet<_> = terminal_roots
                .into_iter()
                .take(MAX_TERMINAL_TASKS)
                .map(|(id, _)| id)
                .collect();
            tasks.retain(|task| {
                !is_terminal(&task.status)
                    || retained.contains(&task.id)
                    || task
                        .parent_id
                        .as_ref()
                        .is_some_and(|id| retained.contains(id))
            });
        }
        let _ = self.persist();
    }
}

#[tauri::command]
pub fn list_transfer_tasks(state: State<'_, TransferManager>) -> Result<Vec<TransferTask>, String> {
    state
        .inner
        .tasks
        .lock()
        .map(|tasks| tasks.clone())
        .map_err(|_| "传输状态不可用。".to_string())
}

#[tauri::command]
pub async fn enqueue_r2_uploads(
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
    let (client, bucket) = r2::client_for_connection(&connection_id, connections.inner())?;
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
        let task = new_task(
            None,
            "upload",
            &connection_id,
            &bucket,
            file_name,
            &key,
            &local_path,
            true,
        );
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

#[tauri::command]
pub async fn prepare_r2_download(
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
    let (client, bucket) = r2::client_for_connection(&connection_id, connections.inner())?;
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

#[tauri::command]
pub fn enqueue_r2_download(
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
    let (client, bucket) = r2::client_for_connection(&plan.connection_id, connections.inner())?;
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

#[tauri::command]
pub fn cancel_transfer_task(
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
        if task.parent_id.is_none() && task.operation == "folder" {
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
                tasks.iter().any(|task| {
                    task.id == id && matches!(task.status.as_str(), "queued" | "running")
                })
            })
            .unwrap_or(false);
        if !active {
            continue;
        }
        if let Ok(handles) = manager.inner.handles.lock()
            && let Some(handle) = handles.get(&id)
        {
            handle.abort();
        }
        if let Ok(mut handles) = manager.inner.handles.lock() {
            handles.remove(&id);
        }
        manager.update_task(&app, &id, "cancelled", None);
    }
    Ok(())
}

#[tauri::command]
pub fn retry_transfer_task(
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
    if original.operation == "folder" {
        return Err("请在文件夹任务中重试失败的文件。".to_string());
    }
    if !matches!(
        original.status.as_str(),
        "failed" | "cancelled" | "interrupted"
    ) {
        return Err("只有失败、中断或已取消的任务可以重试。".to_string());
    }
    let (client, bucket) = r2::client_for_connection(&original.connection_id, connections.inner())?;
    let mut retry = original.clone();
    retry.id = make_id();
    retry.parent_id = None;
    retry.status = "queued".to_string();
    retry.error = None;
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

#[tauri::command]
pub fn clear_transfer_history(
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

fn spawn_task(
    app: AppHandle,
    inner: Arc<TransferManagerInner>,
    task: TransferTask,
    client: Client,
    bucket: String,
    download_root: Option<PathBuf>,
) {
    let manager = TransferManager {
        inner: inner.clone(),
    };
    let id = task.id.clone();
    let task_inner = inner.clone();
    let worker_task = task.clone();
    let handle_id = id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let Ok(_permit) = task_inner.semaphore.clone().acquire_owned().await else {
            return;
        };
        manager.update_task(&app, &id, "running", None);
        let result = if worker_task.operation == "upload" {
            r2::upload_file(
                &client,
                &bucket,
                &worker_task.object_key_prefix(),
                Path::new(&worker_task.local_path),
            )
            .await
            .map(|_| true)
        } else {
            let root = download_root.as_deref().unwrap_or_else(|| {
                Path::new(&worker_task.local_path)
                    .parent()
                    .unwrap_or(Path::new("."))
            });
            r2::download_file(
                &client,
                &bucket,
                &worker_task.object_key,
                &worker_task.relative_path,
                root,
                worker_task.overwrite,
            )
            .await
        };
        match result {
            Ok(true) => manager.update_task(&app, &id, "completed", None),
            Ok(false) => manager.update_task(&app, &id, "skipped", None),
            Err(error) => manager.update_task(&app, &id, "failed", Some(error)),
        }
        if let Ok(mut handles) = task_inner.handles.lock() {
            handles.remove(&id);
        }
    });
    if let Ok(mut handles) = inner.handles.lock() {
        handles.insert(handle_id, handle);
    }
}

impl TransferTask {
    fn object_key_prefix(&self) -> String {
        self.object_key
            .rsplit_once('/')
            .map(|(prefix, _)| prefix.to_string())
            .unwrap_or_default()
    }
}

#[allow(clippy::too_many_arguments)]
fn new_task(
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
        status: "queued".to_string(),
        error: None,
        created_at: timestamp,
        updated_at: timestamp,
        overwrite,
    }
}

fn make_id() -> String {
    format!("{}-{}", now(), NEXT_ID.fetch_add(1, Ordering::Relaxed))
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn is_terminal(status: &str) -> bool {
    matches!(
        status,
        "completed" | "failed" | "cancelled" | "interrupted" | "skipped"
    )
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
