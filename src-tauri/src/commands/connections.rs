use crate::connection::manager::{
    StorageConnectionState, connect_runtime, prepare_connection, register_connection,
};
use crate::connection::model::{
    ConnectStorageRequest, SavedStorageConnection, SavedStorageCredentials, StorageConnectionResult,
};
use crate::persistence::connections::{
    load_saved_connections, remove_saved_connection, save_connection,
};
use crate::security::credentials::read_saved_credentials;
use crate::storage::s3::objects::fetch_page;
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
