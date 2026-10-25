use crate::connection::manager::{PreparedConnection, new_connection_id};
use crate::connection::model::{ConnectStorageRequest, SavedStorageConnection, StorageProvider};
use aws_sdk_s3::{Client, config::Credentials};

const GCS_ENDPOINT: &str = "https://storage.googleapis.com";

pub(crate) async fn prepare_connection(
    request: &ConnectStorageRequest,
) -> Result<PreparedConnection, String> {
    let bucket = request.bucket.trim();
    let access_key_id = request.access_key_id.trim();
    let secret_access_key = request.secret_access_key.trim();
    if bucket.is_empty() || bucket.contains('/') || bucket.chars().any(char::is_whitespace) {
        return Err("请填写有效的 Google Cloud Storage Bucket 名称。".to_string());
    }
    if access_key_id.is_empty() || secret_access_key.is_empty() {
        return Err("请填写 Google Cloud Storage HMAC Access ID 和 Secret。".to_string());
    }
    if request.endpoint.as_deref().is_some_and(|value| {
        !value.trim().is_empty() && value.trim().trim_end_matches('/') != GCS_ENDPOINT
    }) {
        return Err("GCS Endpoint 必须是 https://storage.googleapis.com。".to_string());
    }

    let credentials = Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "cloudstore-gcs",
    );
    // GCS accepts S3 V4 HMAC requests at its XML API endpoint. Path style also
    // works for bucket names containing dots, which cannot use a TLS subdomain.
    let shared_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .endpoint_url(GCS_ENDPOINT)
        .region("us-east-1")
        .credentials_provider(credentials)
        .load()
        .await;
    let client = Client::from_conf(
        aws_sdk_s3::config::Builder::from(&shared_config)
            .force_path_style(true)
            .request_checksum_calculation(
                aws_sdk_s3::config::RequestChecksumCalculation::WhenRequired,
            )
            .response_checksum_validation(
                aws_sdk_s3::config::ResponseChecksumValidation::WhenRequired,
            )
            .build(),
    );
    let name = request.name.trim();
    Ok(PreparedConnection {
        client,
        profile: SavedStorageConnection {
            id: request
                .connection_id
                .clone()
                .unwrap_or_else(|| new_connection_id(StorageProvider::GoogleCloudStorage)),
            name: if name.is_empty() { bucket } else { name }.to_string(),
            provider: StorageProvider::GoogleCloudStorage,
            region: String::new(),
            account_id: String::new(),
            endpoint: GCS_ENDPOINT.to_string(),
            bucket: bucket.to_string(),
        },
    })
}
