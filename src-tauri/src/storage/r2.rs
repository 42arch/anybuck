use aws_sdk_s3::{
    Client,
    config::Credentials,
    types::{Delete, ObjectIdentifier},
};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const PAGE_SIZE: i32 = 100;
const DELETE_BATCH_SIZE: usize = 1000;
const KEYRING_SERVICE: &str = "com.cloudstore.r2";
const KEYRING_USERNAME: &str = "primary";
const PROFILE_FILE: &str = "r2-connection.json";
static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct R2ConnectionState {
    connections: Mutex<HashMap<String, ConnectedR2>>,
}

struct ConnectedR2 {
    client: Client,
    bucket: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectR2Request {
    connection_id: Option<String>,
    name: String,
    account_id: String,
    endpoint: Option<String>,
    access_key_id: String,
    secret_access_key: String,
    bucket: String,
    #[serde(default)]
    remember_connection: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedR2Connection {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    account_id: String,
    endpoint: String,
    bucket: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedR2Credentials {
    access_key_id: String,
    secret_access_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct R2ConnectionResult {
    connection_id: String,
    name: String,
    bucket: String,
    endpoint: String,
    objects: Vec<R2Object>,
    next_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct R2ObjectPage {
    objects: Vec<R2Object>,
    next_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteR2ObjectsResult {
    deleted_count: usize,
    failed_keys: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct R2Object {
    key: String,
    name: String,
    kind: &'static str,
    size: Option<i64>,
    last_modified: Option<String>,
    etag: Option<String>,
}

#[tauri::command]
pub async fn connect_r2(
    app: AppHandle,
    request: ConnectR2Request,
    state: State<'_, R2ConnectionState>,
) -> Result<R2ConnectionResult, String> {
    let prepared = prepare_connection(&request).await?;
    let page = fetch_page(&prepared.client, &prepared.profile.bucket, "", None).await?;

    if request.remember_connection {
        let app_for_store = app;
        let profile = prepared.profile.clone();
        let credentials = SavedR2Credentials {
            access_key_id: request.access_key_id.trim().to_string(),
            secret_access_key: request.secret_access_key.trim().to_string(),
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
pub async fn list_saved_r2_connections(app: AppHandle) -> Result<Vec<SavedR2Connection>, String> {
    let app_for_load = app.clone();
    tauri::async_runtime::spawn_blocking(move || load_saved_connections(&app_for_load))
        .await
        .map_err(|error| format!("无法读取已保存的 R2 连接：{error}"))?
}

#[tauri::command]
pub async fn connect_saved_r2_connection(
    app: AppHandle,
    connection_id: String,
    state: State<'_, R2ConnectionState>,
) -> Result<R2ConnectionResult, String> {
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
    .map_err(|error| format!("无法读取已保存的 R2 连接：{error}"))??
    .ok_or_else(|| "已保存的连接不存在，请刷新连接列表后重试。".to_string())?;
    let profile_for_credentials = profile.clone();
    let credentials = tauri::async_runtime::spawn_blocking(move || {
        read_saved_credentials(&profile_for_credentials.id)
    })
    .await
    .map_err(|error| format!("无法读取系统凭证库：{error}"))??;
    connect_runtime(
        ConnectR2Request {
            connection_id: Some(profile.id),
            name: profile.name,
            account_id: profile.account_id,
            endpoint: Some(profile.endpoint),
            access_key_id: credentials.access_key_id,
            secret_access_key: credentials.secret_access_key,
            bucket: profile.bucket,
            remember_connection: true,
        },
        state.inner(),
    )
    .await
}

#[tauri::command]
pub fn disconnect_r2_connection(
    connection_id: String,
    state: State<'_, R2ConnectionState>,
) -> Result<(), String> {
    state
        .connections
        .lock()
        .map_err(|_| "R2 连接状态不可用，请重启应用后重试。".to_string())?
        .remove(&connection_id);
    Ok(())
}

#[tauri::command]
pub async fn forget_saved_r2_connection(
    app: AppHandle,
    connection_id: String,
    state: State<'_, R2ConnectionState>,
) -> Result<(), String> {
    let id_for_store = connection_id.clone();
    tauri::async_runtime::spawn_blocking(move || remove_saved_connection(&app, &id_for_store))
        .await
        .map_err(|error| format!("无法清除已保存的连接：{error}"))??;
    state
        .connections
        .lock()
        .map_err(|_| "R2 连接状态不可用，请重启应用后重试。".to_string())?
        .remove(&connection_id);
    Ok(())
}

#[tauri::command]
pub async fn list_r2_objects(
    connection_id: String,
    prefix: String,
    continuation_token: Option<String>,
    state: State<'_, R2ConnectionState>,
) -> Result<R2ObjectPage, String> {
    let (client, bucket) = {
        let connections = state
            .connections
            .lock()
            .map_err(|_| "R2 连接状态不可用，请重启应用后重试。".to_string())?;
        let connection = connections
            .get(&connection_id)
            .ok_or_else(|| "R2 会话已失效，请重新连接。".to_string())?;
        (connection.client.clone(), connection.bucket.clone())
    };

    fetch_page(&client, &bucket, &prefix, continuation_token.as_deref()).await
}

#[tauri::command]
pub async fn delete_r2_objects(
    connection_id: String,
    keys: Vec<String>,
    state: State<'_, R2ConnectionState>,
) -> Result<DeleteR2ObjectsResult, String> {
    let (client, bucket) = {
        let connections = state
            .connections
            .lock()
            .map_err(|_| "R2 连接状态不可用，请重启应用后重试。".to_string())?;
        let connection = connections
            .get(&connection_id)
            .ok_or_else(|| "R2 会话已失效，请重新连接。".to_string())?;
        (connection.client.clone(), connection.bucket.clone())
    };

    if keys.is_empty() {
        return Ok(DeleteR2ObjectsResult {
            deleted_count: 0,
            failed_keys: Vec::new(),
        });
    }

    let mut object_keys = HashSet::new();
    for key in keys {
        if key.is_empty() {
            return Err("不能删除空的对象 Key。".to_string());
        }

        if key.ends_with('/') {
            let mut continuation_token = None;
            loop {
                let mut request = client
                    .list_objects_v2()
                    .bucket(&bucket)
                    .prefix(&key)
                    .max_keys(PAGE_SIZE);
                if let Some(token) = continuation_token.as_deref() {
                    request = request.continuation_token(token);
                }
                let page = request
                    .send()
                    .await
                    .map_err(|error| format_r2_error(&error))?;
                for object in page.contents() {
                    if let Some(object_key) = object.key() {
                        object_keys.insert(object_key.to_string());
                    }
                }
                continuation_token = page.next_continuation_token().map(ToOwned::to_owned);
                if continuation_token.is_none() {
                    break;
                }
            }
        } else {
            object_keys.insert(key);
        }
    }

    let mut result = DeleteR2ObjectsResult {
        deleted_count: 0,
        failed_keys: Vec::new(),
    };
    let object_keys = object_keys.into_iter().collect::<Vec<_>>();
    for batch in object_keys.chunks(DELETE_BATCH_SIZE) {
        let identifiers = batch
            .iter()
            .map(|key| {
                ObjectIdentifier::builder()
                    .key(key)
                    .build()
                    .map_err(|error| format!("无法构建删除请求：{error}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let delete = Delete::builder()
            .set_objects(Some(identifiers))
            .build()
            .map_err(|error| format!("无法构建删除请求：{error}"))?;
        let output = client
            .delete_objects()
            .bucket(&bucket)
            .delete(delete)
            .send()
            .await
            .map_err(|error| format_r2_error(&error))?;
        result.deleted_count += output.deleted().len();
        result.failed_keys.extend(
            output
                .errors()
                .iter()
                .filter_map(|error| error.key().map(ToOwned::to_owned)),
        );
    }

    Ok(result)
}

struct PreparedConnection {
    client: Client,
    profile: SavedR2Connection,
}

async fn prepare_connection(request: &ConnectR2Request) -> Result<PreparedConnection, String> {
    let account_id = request.account_id.trim();
    let bucket = request.bucket.trim();
    let requested_name = request.name.trim();
    let access_key_id = request.access_key_id.trim();
    let secret_access_key = request.secret_access_key.trim();

    if account_id.is_empty()
        || bucket.is_empty()
        || access_key_id.is_empty()
        || secret_access_key.is_empty()
    {
        return Err("请填写账号 ID、Access Key、Secret Access Key 和 Bucket。".to_string());
    }
    if account_id.len() != 32 || !account_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Cloudflare 账号 ID 应为 32 位十六进制字符。".to_string());
    }

    let endpoint = request
        .endpoint
        .as_deref()
        .map(str::trim)
        .filter(|endpoint| !endpoint.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("https://{account_id}.r2.cloudflarestorage.com"));
    let endpoint = endpoint.trim_end_matches('/').to_string();
    let allowed_endpoints = [
        format!("https://{account_id}.r2.cloudflarestorage.com"),
        format!("https://{account_id}.eu.r2.cloudflarestorage.com"),
        format!("https://{account_id}.us.r2.cloudflarestorage.com"),
        format!("https://{account_id}.fedramp.r2.cloudflarestorage.com"),
    ];
    if !allowed_endpoints.iter().any(|allowed| allowed == &endpoint) {
        return Err("Endpoint 必须是该账号对应的 Cloudflare R2 S3 API 地址。".to_string());
    }

    let credentials = Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "cloudstore-r2",
    );
    let shared_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .endpoint_url(&endpoint)
        .region("auto")
        .credentials_provider(credentials)
        .load()
        .await;

    Ok(PreparedConnection {
        client: Client::new(&shared_config),
        profile: SavedR2Connection {
            id: request
                .connection_id
                .clone()
                .unwrap_or_else(new_connection_id),
            name: if requested_name.is_empty() {
                bucket
            } else {
                requested_name
            }
            .to_string(),
            account_id: account_id.to_string(),
            endpoint,
            bucket: bucket.to_string(),
        },
    })
}

async fn connect_runtime(
    request: ConnectR2Request,
    state: &R2ConnectionState,
) -> Result<R2ConnectionResult, String> {
    let prepared = prepare_connection(&request).await?;
    let page = fetch_page(&prepared.client, &prepared.profile.bucket, "", None).await?;
    register_connection(state, prepared, page)
}

fn register_connection(
    state: &R2ConnectionState,
    prepared: PreparedConnection,
    page: R2ObjectPage,
) -> Result<R2ConnectionResult, String> {
    let connection_id = prepared.profile.id.clone();
    let mut connections = state
        .connections
        .lock()
        .map_err(|_| "R2 连接状态不可用，请重启应用后重试。".to_string())?;
    connections.insert(
        connection_id.clone(),
        ConnectedR2 {
            client: prepared.client,
            bucket: prepared.profile.bucket.clone(),
        },
    );

    Ok(R2ConnectionResult {
        connection_id,
        name: prepared.profile.name,
        bucket: prepared.profile.bucket,
        endpoint: prepared.profile.endpoint,
        objects: page.objects,
        next_token: page.next_token,
    })
}

async fn fetch_page(
    client: &Client,
    bucket: &str,
    prefix: &str,
    continuation_token: Option<&str>,
) -> Result<R2ObjectPage, String> {
    let normalized_prefix = if prefix.is_empty() {
        String::new()
    } else {
        format!("{}/", prefix.trim_matches('/'))
    };
    let mut request = client
        .list_objects_v2()
        .bucket(bucket)
        .prefix(&normalized_prefix)
        .delimiter("/")
        .max_keys(PAGE_SIZE);
    if let Some(token) = continuation_token {
        request = request.continuation_token(token);
    }

    let output = request
        .send()
        .await
        .map_err(|error| format_r2_error(&error))?;
    let mut objects = Vec::new();

    for common_prefix in output.common_prefixes() {
        if let Some(key) = common_prefix.prefix() {
            let name = key
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .unwrap_or_default()
                .to_string();
            if !name.is_empty() {
                objects.push(R2Object {
                    key: key.to_string(),
                    name,
                    kind: "directory",
                    size: None,
                    last_modified: None,
                    etag: None,
                });
            }
        }
    }

    for object in output.contents() {
        let Some(key) = object.key() else {
            continue;
        };
        if key == normalized_prefix || key.ends_with('/') {
            continue;
        }
        let name = key.rsplit('/').next().unwrap_or_default().to_string();
        objects.push(R2Object {
            key: key.to_string(),
            name,
            kind: "file",
            size: object.size(),
            last_modified: object.last_modified().map(ToString::to_string),
            etag: object.e_tag().map(ToOwned::to_owned),
        });
    }

    Ok(R2ObjectPage {
        objects,
        next_token: output.next_continuation_token().map(ToOwned::to_owned),
    })
}

fn load_saved_connections(app: &AppHandle) -> Result<Vec<SavedR2Connection>, String> {
    let path = profile_path(app)?;
    match fs::read(path) {
        Ok(contents) => {
            let value: serde_json::Value = serde_json::from_slice(&contents)
                .map_err(|error| format!("已保存的 R2 连接信息无法读取：{error}"))?;
            if value.is_array() {
                serde_json::from_value(value)
                    .map_err(|error| format!("已保存的 R2 连接信息无法读取：{error}"))
            } else {
                let mut profile: SavedR2Connection = serde_json::from_value(value)
                    .map_err(|error| format!("已保存的 R2 连接信息无法读取：{error}"))?;
                // Migrate the previous single-profile format and preserve its keyring entry.
                profile.id = KEYRING_USERNAME.to_string();
                if profile.name.is_empty() {
                    profile.name = profile.bucket.clone();
                }
                Ok(vec![profile])
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("无法读取 R2 连接信息：{error}")),
    }
}

fn save_connection(
    app: &AppHandle,
    profile: &SavedR2Connection,
    credentials: &SavedR2Credentials,
) -> Result<(), String> {
    let path = profile_path(app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "应用数据目录无效。".to_string())?;
    fs::create_dir_all(directory).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    let mut profiles = load_saved_connections(app)?;
    profiles.retain(|saved| saved.id != profile.id);
    profiles.push(profile.clone());
    let profile_bytes = serde_json::to_vec(&profiles)
        .map_err(|error| format!("无法序列化 R2 连接信息：{error}"))?;
    let credentials = serde_json::to_string(credentials)
        .map_err(|error| format!("无法序列化系统凭证：{error}"))?;
    let previous_profile = fs::read(&path).ok();
    let entry = credential_entry(&profile.id)?;
    let previous_secret = match entry.get_password() {
        Ok(secret) => Some(secret),
        Err(keyring::Error::NoEntry) => None,
        Err(error) => return Err(keyring_error(error)),
    };

    entry.set_password(&credentials).map_err(keyring_error)?;
    if let Err(error) = fs::write(&path, profile_bytes) {
        restore_previous_secret(&entry, previous_secret.as_deref());
        restore_previous_profile(&path, previous_profile.as_deref());
        return Err(format!("无法保存 R2 连接信息：{error}"));
    }
    Ok(())
}

fn remove_saved_connection(app: &AppHandle, connection_id: &str) -> Result<(), String> {
    let path = profile_path(app)?;
    let previous_profile = fs::read(&path).ok();
    let mut profiles = load_saved_connections(app)?;
    if !profiles.iter().any(|profile| profile.id == connection_id) {
        return Ok(());
    }
    profiles.retain(|profile| profile.id != connection_id);
    if profiles.is_empty() {
        fs::remove_file(&path).map_err(|error| format!("无法删除已保存的连接信息：{error}"))?;
    } else {
        let contents = serde_json::to_vec(&profiles)
            .map_err(|error| format!("无法序列化 R2 连接信息：{error}"))?;
        fs::write(&path, contents).map_err(|error| format!("无法更新已保存的连接信息：{error}"))?;
    }
    let entry = credential_entry(connection_id)?;
    if let Err(error) = entry.delete_credential()
        && !matches!(error, keyring::Error::NoEntry)
    {
        restore_previous_profile(&path, previous_profile.as_deref());
        return Err(keyring_error(error));
    }
    Ok(())
}

fn read_saved_credentials(connection_id: &str) -> Result<SavedR2Credentials, String> {
    let credentials = credential_entry(connection_id)?
        .get_password()
        .map_err(keyring_error)?;
    serde_json::from_str(&credentials)
        .map_err(|_| "系统凭证库中的 R2 凭证格式无效，请重新连接。".to_string())
}

fn credential_entry(connection_id: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, connection_id).map_err(keyring_error)
}

fn new_connection_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let sequence = NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed);
    format!("r2-{timestamp}-{sequence}")
}

fn profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(PROFILE_FILE))
        .map_err(|error| format!("无法定位应用数据目录：{error}"))
}

fn restore_previous_secret(entry: &Entry, previous_secret: Option<&str>) {
    match previous_secret {
        Some(secret) => {
            let _ = entry.set_password(secret);
        }
        None => {
            let _ = entry.delete_credential();
        }
    }
}

fn restore_previous_profile(path: &PathBuf, previous_profile: Option<&[u8]>) {
    match previous_profile {
        Some(contents) => {
            let _ = fs::write(path, contents);
        }
        None => {
            let _ = fs::remove_file(path);
        }
    }
}

fn keyring_error(error: keyring::Error) -> String {
    format!("系统凭证库不可用或无法访问：{error}")
}

fn format_r2_error(error: &impl std::fmt::Display) -> String {
    format!("R2 请求失败：{error}")
}

#[cfg(test)]
mod tests {
    use super::SavedR2Connection;

    #[test]
    fn saved_profile_contains_no_access_keys() {
        let profile = SavedR2Connection {
            id: "r2-test".to_string(),
            name: "Assets".to_string(),
            account_id: "0123456789abcdef0123456789abcdef".to_string(),
            endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
                .to_string(),
            bucket: "assets".to_string(),
        };
        let serialized = serde_json::to_string(&profile).unwrap();

        assert!(!serialized.contains("accessKeyId"));
        assert!(!serialized.contains("secretAccessKey"));
        assert!(serialized.contains("assets"));
    }
}
