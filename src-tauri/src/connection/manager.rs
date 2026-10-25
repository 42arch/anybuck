use crate::connection::model::{
    ConnectStorageRequest, SavedStorageConnection, StorageConnectionResult, StorageProvider,
};
use crate::connection::{aws, cos, gcs, kodo, oss, r2, tos};
use crate::storage::s3::objects::{StorageObjectPage, fetch_page};
use aws_sdk_s3::Client;
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

pub(crate) struct PreparedConnection {
    pub(crate) client: Client,
    pub(crate) profile: SavedStorageConnection,
}

pub(crate) async fn prepare_connection(
    request: &ConnectStorageRequest,
) -> Result<PreparedConnection, String> {
    match request.provider {
        StorageProvider::CloudflareR2 => r2::prepare_connection(request).await,
        StorageProvider::AwsS3 => aws::prepare_connection(request).await,
        StorageProvider::TencentCos => cos::prepare_connection(request).await,
        StorageProvider::AliyunOss => oss::prepare_connection(request).await,
        StorageProvider::GoogleCloudStorage => gcs::prepare_connection(request).await,
        StorageProvider::QiniuKodo => kodo::prepare_connection(request).await,
        StorageProvider::VolcengineTos => tos::prepare_connection(request).await,
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
        StorageProvider::GoogleCloudStorage => "gcs",
        StorageProvider::QiniuKodo => "kodo",
        StorageProvider::VolcengineTos => "tos",
    };
    format!("{prefix}-{timestamp}-{sequence}")
}

#[derive(Default)]
pub struct StorageConnectionState {
    pub(crate) connections: Mutex<HashMap<String, ConnectedStorage>>,
}

pub(crate) struct ConnectedStorage {
    pub(crate) client: Client,
    pub(crate) bucket: String,
    identity: StorageIdentity,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct StorageIdentity {
    provider: StorageProvider,
    endpoint: String,
    bucket: String,
}

impl From<&SavedStorageConnection> for StorageIdentity {
    fn from(profile: &SavedStorageConnection) -> Self {
        Self {
            provider: profile.provider,
            endpoint: profile.endpoint.trim_end_matches('/').to_ascii_lowercase(),
            bucket: profile.bucket.clone(),
        }
    }
}

pub(crate) fn connections_share_bucket(
    source_id: &str,
    target_id: &str,
    state: &StorageConnectionState,
) -> Result<bool, String> {
    let connections = state
        .connections
        .lock()
        .map_err(|_| "存储连接状态不可用，请重启应用后重试。".to_string())?;
    let source = connections
        .get(source_id)
        .ok_or_else(|| "源存储会话已失效，请重新连接。".to_string())?;
    let target = connections
        .get(target_id)
        .ok_or_else(|| "目标存储会话已失效，请重新连接。".to_string())?;
    Ok(source.identity == target.identity)
}

pub(crate) fn client_for_connection(
    connection_id: &str,
    state: &StorageConnectionState,
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
    request: ConnectStorageRequest,
    state: &StorageConnectionState,
) -> Result<StorageConnectionResult, String> {
    let prepared = prepare_connection(&request).await?;
    let page = fetch_page(&prepared.client, &prepared.profile.bucket, "", None).await?;
    register_connection(state, prepared, page)
}

pub(crate) fn register_connection(
    state: &StorageConnectionState,
    prepared: PreparedConnection,
    page: StorageObjectPage,
) -> Result<StorageConnectionResult, String> {
    let connection_id = prepared.profile.id.clone();
    let mut connections = state
        .connections
        .lock()
        .map_err(|_| "存储连接状态不可用，请重启应用后重试。".to_string())?;
    connections.insert(
        connection_id.clone(),
        ConnectedStorage {
            client: prepared.client,
            bucket: prepared.profile.bucket.clone(),
            identity: StorageIdentity::from(&prepared.profile),
        },
    );

    Ok(StorageConnectionResult {
        connection_id,
        provider: prepared.profile.provider,
        name: prepared.profile.name,
        bucket: prepared.profile.bucket,
        endpoint: prepared.profile.endpoint,
        objects: page.objects,
        next_token: page.next_token,
    })
}

#[cfg(test)]
mod tests {
    use super::StorageIdentity;
    use crate::connection::model::{SavedStorageConnection, StorageProvider};

    fn profile(provider: StorageProvider, endpoint: &str, bucket: &str) -> SavedStorageConnection {
        SavedStorageConnection {
            id: String::new(),
            name: String::new(),
            provider,
            region: String::new(),
            account_id: String::new(),
            endpoint: endpoint.to_string(),
            bucket: bucket.to_string(),
        }
    }

    #[test]
    fn bucket_identity_ignores_connection_name_and_endpoint_trailing_slash() {
        let first = StorageIdentity::from(&profile(
            StorageProvider::CloudflareR2,
            "https://ACCOUNT.r2.cloudflarestorage.com/",
            "assets",
        ));
        let duplicate = StorageIdentity::from(&profile(
            StorageProvider::CloudflareR2,
            "https://account.r2.cloudflarestorage.com",
            "assets",
        ));
        assert_eq!(first, duplicate);
        assert_ne!(
            first,
            StorageIdentity::from(&profile(
                StorageProvider::CloudflareR2,
                "https://other.r2.cloudflarestorage.com",
                "assets",
            ))
        );
        assert_ne!(
            first,
            StorageIdentity::from(&profile(
                StorageProvider::AwsS3,
                "https://account.r2.cloudflarestorage.com",
                "assets",
            ))
        );
    }
}
