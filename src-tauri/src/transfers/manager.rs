use crate::error::{AppError, ErrorCode};
use crate::persistence::tasks::{load_tasks, save_tasks};
use crate::storage::s3::copy::CopyCheckpoint;
use crate::transfers::model::{TransferTask, is_terminal, now};
use crate::transfers::planner::DownloadPlan;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, async_runtime::JoinHandle};
use tokio::sync::Semaphore;

const EVENT_NAME: &str = "transfer-task-updated";
const MAX_PARALLEL_TRANSFERS: usize = 2;
const MAX_TERMINAL_TASKS: usize = 100;
const TASKS_FILE: &str = "transfers.json";

#[derive(Clone)]
pub struct TransferManager {
    pub(crate) inner: Arc<TransferManagerInner>,
}

pub(crate) struct TransferManagerInner {
    pub(crate) tasks: Mutex<Vec<TransferTask>>,
    pub(crate) persist_lock: Mutex<()>,
    pub(crate) handles: Mutex<HashMap<String, JoinHandle<()>>>,
    pub(crate) plans: Mutex<HashMap<String, DownloadPlan>>,
    pub(crate) semaphore: Arc<Semaphore>,
    pub(crate) storage_path: PathBuf,
}

impl TransferManager {
    pub fn load(app: &AppHandle) -> Result<Self, AppError> {
        let directory = app.path().app_data_dir().map_err(|error| {
            AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
        })?;
        fs::create_dir_all(&directory).map_err(|error| {
            AppError::with_detail(ErrorCode::TransferHistoryFailed, error.to_string())
        })?;
        let storage_path = directory.join(TASKS_FILE);
        let mut tasks = load_tasks(&storage_path)?;
        for task in &mut tasks {
            if task.status == "running" || task.status == "queued" {
                task.status = "interrupted".to_string();
                task.error = None;
                task.error_code = Some("transferInterrupted".to_string());
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

    pub(crate) fn persist(&self) -> Result<(), AppError> {
        let _persist_guard = self
            .inner
            .persist_lock
            .lock()
            .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?;
        let tasks = self
            .inner
            .tasks
            .lock()
            .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?;
        save_tasks(&self.inner.storage_path, &tasks)
    }

    pub(crate) fn emit(&self, app: &AppHandle, task: &TransferTask) {
        let _ = app.emit(EVENT_NAME, task);
    }

    pub(crate) fn add_task(&self, app: &AppHandle, task: TransferTask) -> Result<(), AppError> {
        {
            let mut tasks = self
                .inner
                .tasks
                .lock()
                .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?;
            tasks.push(task.clone());
        }
        self.persist()?;
        self.emit(app, &task);
        Ok(())
    }

    pub(crate) fn add_tasks(
        &self,
        app: &AppHandle,
        new_tasks: &[TransferTask],
    ) -> Result<(), AppError> {
        let persist_guard = self
            .inner
            .persist_lock
            .lock()
            .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?;
        {
            let mut tasks = self
                .inner
                .tasks
                .lock()
                .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?;
            let original_len = tasks.len();
            tasks.extend_from_slice(new_tasks);
            if let Err(error) = save_tasks(&self.inner.storage_path, &tasks) {
                tasks.truncate(original_len);
                return Err(error);
            }
        }
        drop(persist_guard);
        for task in new_tasks {
            self.emit(app, task);
        }
        Ok(())
    }

    pub(crate) fn update_task(
        &self,
        app: &AppHandle,
        id: &str,
        status: &str,
        error: Option<AppError>,
    ) {
        let mut changed = Vec::new();
        if let Ok(mut tasks) = self.inner.tasks.lock()
            && let Some(task) = tasks.iter_mut().find(|task| task.id == id)
        {
            task.status = status.to_string();
            task.error_code = error.as_ref().map(AppError::code_key);
            task.error = error.and_then(|error| error.detail);
            if status == "completed" {
                let total = task.total_bytes.unwrap_or(task.transferred_bytes);
                task.total_bytes = Some(total);
                task.transferred_bytes = total;
                task.checkpoint = None;
            }
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
                        } else if children.iter().any(|status| status == "interrupted") {
                            "interrupted".to_string()
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

    pub(crate) fn complete_upload(&self, app: &AppHandle, id: &str, key: String) {
        if let Ok(mut tasks) = self.inner.tasks.lock()
            && let Some(task) = tasks.iter_mut().find(|task| task.id == id)
        {
            task.object_key = key;
        }
        self.update_task(app, id, "completed", None);
    }

    pub(crate) fn update_progress(
        &self,
        app: &AppHandle,
        id: &str,
        transferred: u64,
        total: Option<u64>,
    ) {
        let mut changed = None;
        if let Ok(mut tasks) = self.inner.tasks.lock()
            && let Some(task) = tasks.iter_mut().find(|task| task.id == id)
            && task.status == "running"
        {
            let previous_total = task.total_bytes;
            let previous_update = task.updated_at;
            let previous_transferred = task.transferred_bytes;
            task.total_bytes = total.or(task.total_bytes);
            task.transferred_bytes = transferred.min(task.total_bytes.unwrap_or(u64::MAX));
            let timestamp = now();
            if previous_total != task.total_bytes
                || task.transferred_bytes < previous_transferred
                || timestamp.saturating_sub(previous_update) >= 100
                || task.total_bytes == Some(task.transferred_bytes)
            {
                task.updated_at = timestamp;
                changed = Some(task.clone());
            }
        }
        if let Some(task) = changed {
            self.emit(app, &task);
        }
    }

    pub(crate) fn update_phase(&self, app: &AppHandle, id: &str, phase: &str) {
        let mut changed = None;
        if let Ok(mut tasks) = self.inner.tasks.lock()
            && let Some(task) = tasks.iter_mut().find(|task| task.id == id)
            && task.status == "running"
        {
            task.phase = Some(phase.to_string());
            task.updated_at = now();
            changed = Some(task.clone());
        }
        if let Some(task) = changed {
            self.emit(app, &task);
        }
    }

    pub(crate) fn save_checkpoint(
        &self,
        app: &AppHandle,
        id: &str,
        checkpoint: CopyCheckpoint,
    ) -> Result<(), AppError> {
        let changed = {
            let mut tasks = self
                .inner
                .tasks
                .lock()
                .map_err(|_| AppError::new(ErrorCode::TransferListFailed))?;
            let task = tasks
                .iter_mut()
                .find(|task| task.id == id && task.status == "running")
                .ok_or_else(|| AppError::new(ErrorCode::TransferCancelled))?;
            task.checkpoint = Some(checkpoint);
            task.phase = Some("deleting".to_string());
            task.updated_at = now();
            task.clone()
        };
        self.persist()?;
        self.emit(app, &changed);
        Ok(())
    }

    pub(crate) fn prune(&self) {
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
