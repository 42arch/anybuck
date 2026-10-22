use crate::connection::model::{
    ConnectR2Request, R2ConnectionResult, SavedR2Connection, StorageProvider,
};
use crate::connection::{aws, cos, oss, r2};
use crate::storage::s3::objects::{R2ObjectPage, fetch_page};
use aws_sdk_s3::Client;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

pub(crate) struct PreparedConnection {
    pub(crate) client: Client,
    pub(crate) profile: SavedR2Connection,
}

pub(crate) async fn prepare_connection(
    request: &ConnectR2Request,
) -> Result<PreparedConnection, String> {
    match request.provider {
        StorageProvider::CloudflareR2 => r2::prepare_connection(request).await,
        StorageProvider::AwsS3 => aws::prepare_connection(request).await,
        StorageProvider::TencentCos => cos::prepare_connection(request).await,
        StorageProvider::AliyunOss => oss::prepare_connection(request).await,
    }
}

pub(crate) fn new_connection_id(provider: StorageProvider) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let sequence = NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed);
    let prefix = match provider {
        StorageProvider::CloudflareR2 => "r2",
        StorageProvider::AwsS3 => "s3",
        StorageProvider::TencentCos => "cos",
        StorageProvider::AliyunOss => "oss",
    };
    format!("{prefix}-{timestamp}-{sequence}")
}

#[derive(Default)]
pub struct R2ConnectionState {
    pub(crate) connections: Mutex<HashMap<String, ConnectedR2>>,
}

pub(crate) struct ConnectedR2 {
    pub(crate) client: Client,
    pub(crate) bucket: String,
}
pub(crate) fn client_for_connection(
    connection_id: &str,
    state: &R2ConnectionState,
) -> Result<(Client, String), String> {
    let connections = state
        .connections
        .lock()
        .map_err(|_| "存储连接状态不可用，请重启应用后重试。".to_string())?;
    let connection = connections
        .get(connection_id)
        .ok_or_else(|| "存储会话已失效，请重新连接。".to_string())?;
    Ok((connection.client.clone(), connection.bucket.clone()))
}
pub(crate) async fn connect_runtime(
    request: ConnectR2Request,
    state: &R2ConnectionState,
) -> Result<R2ConnectionResult, String> {
    let prepared = prepare_connection(&request).await?;
    let page = fetch_page(&prepared.client, &prepared.profile.bucket, "", None).await?;
    register_connection(state, prepared, page)
}

pub(crate) fn register_connection(
    state: &R2ConnectionState,
    prepared: PreparedConnection,
    page: R2ObjectPage,
) -> Result<R2ConnectionResult, String> {
    let connection_id = prepared.profile.id.clone();
    let mut connections = state
        .connections
        .lock()
        .map_err(|_| "存储连接状态不可用，请重启应用后重试。".to_string())?;
    connections.insert(
        connection_id.clone(),
        ConnectedR2 {
            client: prepared.client,
            bucket: prepared.profile.bucket.clone(),
        },
    );

    Ok(R2ConnectionResult {
        connection_id,
        provider: prepared.profile.provider,
        name: prepared.profile.name,
        bucket: prepared.profile.bucket,
        endpoint: prepared.profile.endpoint,
        objects: page.objects,
        next_token: page.next_token,
    })
}
