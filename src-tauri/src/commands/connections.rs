use crate::connection::manager::{
    StorageConnectionState, connect_runtime, prepare_connection, register_connection,
};
use crate::connection::model::{
    ConnectStorageRequest, SavedStorageConnection, SavedStorageCredentials,
    StorageConnectionResult, StorageProvider, UpdateStorageConnectionRequest,
};
use crate::persistence::connections::{
    load_saved_connections, remove_saved_connection, rename_saved_connection, save_connection,
};
use crate::security::credentials::read_saved_credentials;
use crate::storage::s3::objects::fetch_page;
use crate::transfers::manager::TransferManager;
use crate::transfers::model::TransferTask;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn connect_storage(
    app: AppHandle,
    request: ConnectStorageRequest,
    state: State<'_, StorageConnectionState>,
) -> Result<StorageConnectionResult, String> {
    let prepared = prepare_connection(&request).await?;
    let page = fetch_page(&prepared.client, &prepared.profile.bucket, "", None).await?;

    if request.remember_connection {
        let app_for_store = app;
        let profile = prepared.profile.clone();
        let credentials = SavedStorageCredentials {
            access_key_id: request.access_key_id.trim().to_string(),
            secret_access_key: request.secret_access_key.trim().to_string(),
            session_token: request.session_token.trim().to_string(),
        };
        tauri::async_runtime::spawn_blocking(move || {
            save_connection(&app_for_store, &profile, &credentials)
        })
        .await
        .map_err(|error| format!("无法保存连接信息：{error}"))??;
    }

    register_connection(state.inner(), prepared, page)
}

#[tauri::command]
pub async fn list_saved_connections(app: AppHandle) -> Result<Vec<SavedStorageConnection>, String> {
    let app_for_load = app.clone();
    tauri::async_runtime::spawn_blocking(move || load_saved_connections(&app_for_load))
        .await
        .map_err(|error| format!("无法读取已保存的存储连接：{error}"))?
}

#[tauri::command]
pub async fn rename_connection(
    app: AppHandle,
    connection_id: String,
    name: String,
) -> Result<SavedStorageConnection, String> {
    tauri::async_runtime::spawn_blocking(move || {
        rename_saved_connection(&app, &connection_id, &name)
    })
    .await
    .map_err(|error| format!("无法重命名连接：{error}"))?
}

#[tauri::command]
pub async fn connect_saved_connection(
    app: AppHandle,
    connection_id: String,
    state: State<'_, StorageConnectionState>,
) -> Result<StorageConnectionResult, String> {
    let app_for_load = app.clone();
    let connection_id_for_load = connection_id.clone();
    let profile = tauri::async_runtime::spawn_blocking(move || {
        load_saved_connections(&app_for_load).map(|profiles| {
            profiles
                .into_iter()
                .find(|profile| profile.id == connection_id_for_load)
        })
    })
    .await
    .map_err(|error| format!("无法读取已保存的存储连接：{error}"))??
    .ok_or_else(|| "已保存的连接不存在，请刷新连接列表后重试。".to_string())?;
    let profile_for_credentials = profile.clone();
    let credentials = tauri::async_runtime::spawn_blocking(move || {
        read_saved_credentials(
            profile_for_credentials.provider,
            &profile_for_credentials.id,
        )
    })
    .await
    .map_err(|error| format!("无法读取系统凭证库：{error}"))??;
    connect_runtime(
        ConnectStorageRequest {
            connection_id: Some(profile.id),
            provider: profile.provider,
            name: profile.name,
            account_id: profile.account_id,
            region: profile.region,
            endpoint: Some(profile.endpoint),
            access_key_id: credentials.access_key_id,
            secret_access_key: credentials.secret_access_key,
            session_token: credentials.session_token,
            bucket: profile.bucket,
            remember_connection: true,
        },
        state.inner(),
    )
    .await
}

fn ensure_target_edit_safe(
    manager: &TransferManager,
    connection_id: &str,
    target_changed: bool,
) -> Result<(), String> {
    if !target_changed {
        return Ok(());
    }
    let tasks = manager
        .inner
        .tasks
        .lock()
        .map_err(|_| "传输状态不可用。".to_string())?;
    let has_retryable_task = target_edit_conflicts(&tasks, connection_id);
    if has_retryable_task {
        return Err("此连接仍有关联的待处理或可重试传输任务。请完成或清除这些任务后再修改 Bucket、地域或 Endpoint；仅更新名称或凭证可以继续。".to_string());
    }
    Ok(())
}

fn target_edit_conflicts(tasks: &[TransferTask], connection_id: &str) -> bool {
    tasks.iter().any(|task| {
        (task.connection_id == connection_id || task.destination_connection_id == connection_id)
            && !matches!(task.status.as_str(), "completed" | "skipped")
    })
}

#[tauri::command]
pub async fn update_saved_connection(
    app: AppHandle,
    request: UpdateStorageConnectionRequest,
    state: State<'_, StorageConnectionState>,
    manager: State<'_, TransferManager>,
) -> Result<StorageConnectionResult, String> {
    let connection_id = request.connection_id.trim();
    let name = request.name.trim();
    if connection_id.is_empty() {
        return Err("连接 ID 不能为空。".to_string());
    }
    if name.is_empty() || name.chars().count() > 100 {
        return Err("连接名称应为 1–100 个字符。".to_string());
    }
    let app_for_load = app.clone();
    let id_for_load = connection_id.to_string();
    let original = tauri::async_runtime::spawn_blocking(move || {
        load_saved_connections(&app_for_load).map(|profiles| {
            profiles
                .into_iter()
                .find(|profile| profile.id == id_for_load)
        })
    })
    .await
    .map_err(|error| format!("无法读取已保存的连接：{error}"))??
    .ok_or_else(|| "已保存的连接不存在，请刷新连接列表后重试。".to_string())?;

    let mut credentials = match request.credentials {
        Some(credentials) => credentials,
        None => {
            let provider = original.provider;
            let id = original.id.clone();
            tauri::async_runtime::spawn_blocking(move || read_saved_credentials(provider, &id))
                .await
                .map_err(|error| format!("无法读取系统凭证库：{error}"))??
        }
    };
    credentials.access_key_id = credentials.access_key_id.trim().to_string();
    credentials.secret_access_key = credentials.secret_access_key.trim().to_string();
    credentials.session_token = if original.provider == StorageProvider::AwsS3 {
        credentials.session_token.trim().to_string()
    } else {
        String::new()
    };
    let connect_request = ConnectStorageRequest {
        connection_id: Some(original.id.clone()),
        provider: original.provider,
        name: name.to_string(),
        account_id: request.account_id,
        region: request.region,
        endpoint: request.endpoint,
        access_key_id: credentials.access_key_id.clone(),
        secret_access_key: credentials.secret_access_key.clone(),
        session_token: credentials.session_token.clone(),
        bucket: request.bucket,
        remember_connection: true,
    };
    let prepared = prepare_connection(&connect_request).await?;
    let target_changed = original.bucket != prepared.profile.bucket
        || original.endpoint != prepared.profile.endpoint
        || original.region != prepared.profile.region
        || original.account_id != prepared.profile.account_id;
    ensure_target_edit_safe(manager.inner(), &original.id, target_changed)?;
    let page = fetch_page(&prepared.client, &prepared.profile.bucket, "", None).await?;
    ensure_target_edit_safe(manager.inner(), &original.id, target_changed)?;

    let app_for_store = app.clone();
    let profile_for_store = prepared.profile.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let current = load_saved_connections(&app_for_store)?
            .into_iter()
            .find(|profile| profile.id == original.id)
            .ok_or_else(|| "连接已被删除，请刷新连接列表后重试。".to_string())?;
        if current != original {
            return Err("连接信息已在其他操作中更新，请刷新后重试。".to_string());
        }
        save_connection(&app_for_store, &profile_for_store, &credentials)
    })
    .await
    .map_err(|error| format!("无法保存已编辑的连接：{error}"))??;
    register_connection(state.inner(), prepared, page)
}

#[tauri::command]
pub fn disconnect_connection(
    connection_id: String,
    state: State<'_, StorageConnectionState>,
) -> Result<(), String> {
    state
        .connections
        .lock()
        .map_err(|_| "存储连接状态不可用，请重启应用后重试。".to_string())?
        .remove(&connection_id);
    Ok(())
}

#[tauri::command]
pub async fn forget_saved_connection(
    app: AppHandle,
    connection_id: String,
    state: State<'_, StorageConnectionState>,
) -> Result<(), String> {
    let id_for_store = connection_id.clone();
    tauri::async_runtime::spawn_blocking(move || remove_saved_connection(&app, &id_for_store))
        .await
        .map_err(|error| format!("无法清除已保存的连接：{error}"))??;
    state
        .connections
        .lock()
        .map_err(|_| "存储连接状态不可用，请重启应用后重试。".to_string())?
        .remove(&connection_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::target_edit_conflicts;
    use crate::transfers::model::new_task;

    #[test]
    fn target_edit_guard_covers_retryable_source_and_destination_tasks() {
        let mut task = new_task(
            None, "upload", "source", "bucket", "file", "file", "", false,
        );
        task.status = "failed".to_string();
        assert!(target_edit_conflicts(&[task.clone()], "source"));
        assert!(!target_edit_conflicts(&[task.clone()], "other"));

        task.destination_connection_id = "destination".to_string();
        task.status = "interrupted".to_string();
        assert!(target_edit_conflicts(&[task.clone()], "destination"));

        task.status = "completed".to_string();
        assert!(!target_edit_conflicts(&[task], "destination"));
    }
}
