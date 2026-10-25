use crate::connection::manager::{StorageConnectionState, client_for_connection};
use crate::storage::s3::objects::{self, DeleteObjectsResult, StorageObjectPage};
use tauri::{State, ipc::Response};

#[tauri::command]
pub async fn list_objects(
    connection_id: String,
    prefix: String,
    continuation_token: Option<String>,
    search: Option<String>,
    state: State<'_, StorageConnectionState>,
) -> Result<StorageObjectPage, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    objects::search_page(
        &client,
        &bucket,
        &prefix,
        continuation_token.as_deref(),
        search.as_deref().unwrap_or_default(),
    )
    .await
}

#[tauri::command]
pub async fn count_objects(
    connection_id: String,
    prefix: String,
    search: Option<String>,
    state: State<'_, StorageConnectionState>,
) -> Result<usize, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    objects::count_objects(&client, &bucket, &prefix, search.as_deref()).await
}

#[tauri::command]
pub async fn preview_image(
    connection_id: String,
    key: String,
    state: State<'_, StorageConnectionState>,
) -> Result<Response, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    let bytes = objects::fetch_object_preview(&client, &bucket, &key, 8 * 1024 * 1024).await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn preview_text(
    connection_id: String,
    key: String,
    state: State<'_, StorageConnectionState>,
) -> Result<Response, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    let bytes = objects::fetch_object_preview(&client, &bucket, &key, 1024 * 1024).await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn delete_objects(
    connection_id: String,
    keys: Vec<String>,
    state: State<'_, StorageConnectionState>,
) -> Result<DeleteObjectsResult, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    objects::delete_objects(&client, &bucket, keys).await
}

#[tauri::command]
pub async fn create_folder(
    connection_id: String,
    prefix: String,
    name: String,
    state: State<'_, StorageConnectionState>,
) -> Result<(), String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    objects::create_folder(&client, &bucket, prefix, name).await
}
