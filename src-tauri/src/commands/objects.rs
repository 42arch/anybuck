use crate::connection::manager::{R2ConnectionState, client_for_connection};
use crate::storage::s3::objects::{self, DeleteR2ObjectsResult, R2ObjectPage};
use tauri::{State, ipc::Response};

#[tauri::command]
pub async fn list_r2_objects(
    connection_id: String,
    prefix: String,
    continuation_token: Option<String>,
    state: State<'_, R2ConnectionState>,
) -> Result<R2ObjectPage, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    objects::fetch_page(&client, &bucket, &prefix, continuation_token.as_deref()).await
}

#[tauri::command]
pub async fn preview_r2_image(
    connection_id: String,
    key: String,
    state: State<'_, R2ConnectionState>,
) -> Result<Response, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    let bytes = objects::fetch_object_preview(&client, &bucket, &key, 8 * 1024 * 1024).await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn preview_r2_text(
    connection_id: String,
    key: String,
    state: State<'_, R2ConnectionState>,
) -> Result<Response, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    let bytes = objects::fetch_object_preview(&client, &bucket, &key, 1024 * 1024).await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn delete_r2_objects(
    connection_id: String,
    keys: Vec<String>,
    state: State<'_, R2ConnectionState>,
) -> Result<DeleteR2ObjectsResult, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    objects::delete_objects(&client, &bucket, keys).await
}

#[tauri::command]
pub async fn create_r2_folder(
    connection_id: String,
    prefix: String,
    name: String,
    state: State<'_, R2ConnectionState>,
) -> Result<(), String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    objects::create_folder(&client, &bucket, prefix, name).await
}
