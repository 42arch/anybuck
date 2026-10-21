use crate::connection::manager::{PreparedConnection, new_connection_id};
use crate::connection::model::{ConnectR2Request, SavedR2Connection, StorageProvider};
use aws_sdk_s3::{Client, config::Credentials};

pub(crate) async fn prepare_connection(
    request: &ConnectR2Request,
) -> Result<PreparedConnection, String> {
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
                .unwrap_or_else(|| new_connection_id(StorageProvider::CloudflareR2)),
            name: if requested_name.is_empty() {
                bucket
            } else {
                requested_name
            }
            .to_string(),
            provider: StorageProvider::CloudflareR2,
            region: String::new(),
            account_id: account_id.to_string(),
            endpoint,
            bucket: bucket.to_string(),
        },
    })
}
