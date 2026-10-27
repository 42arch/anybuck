use crate::connection::manager::{PreparedConnection, new_connection_id};
use crate::connection::model::{ConnectStorageRequest, SavedStorageConnection, StorageProvider};
use crate::error::{AppError, ErrorCode};
use aws_sdk_s3::{Client, config::Credentials};

pub(crate) async fn prepare_connection(
    request: &ConnectStorageRequest,
) -> Result<PreparedConnection, AppError> {
    let region = request.region.trim();
    let bucket = request.bucket.trim();
    let access_key_id = request.access_key_id.trim();
    let secret_access_key = request.secret_access_key.trim();
    if access_key_id.is_empty() || secret_access_key.is_empty() {
        return Err(AppError::new(ErrorCode::ConnectionInvalidCredentials).param("provider", "TOS"));
    }
    let endpoint = tos_endpoint(region, bucket, request.endpoint.as_deref())?;
    let credentials = Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "cloudstore-tos",
    );
    let shared_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .endpoint_url(&endpoint)
        .region(aws_sdk_s3::config::Region::new(region.to_string()))
        .credentials_provider(credentials)
        .load()
        .await;
    let client = Client::from_conf(
        aws_sdk_s3::config::Builder::from(&shared_config)
            .force_path_style(false)
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
                .unwrap_or_else(|| new_connection_id(StorageProvider::VolcengineTos)),
            name: if name.is_empty() { bucket } else { name }.to_string(),
            provider: StorageProvider::VolcengineTos,
            region: region.to_string(),
            account_id: String::new(),
            endpoint,
            bucket: bucket.to_string(),
        },
    })
}

fn tos_endpoint(region: &str, bucket: &str, requested: Option<&str>) -> Result<String, AppError> {
    if region.is_empty()
        || !region
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        || region.starts_with('-')
        || region.ends_with('-')
    {
        return Err(AppError::new(ErrorCode::ConnectionInvalidRegion).param("provider", "TOS"));
    }
    let valid_bucket = (3..=63).contains(&bucket.len())
        && bucket
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && bucket
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && bucket
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric);
    if !valid_bucket {
        return Err(AppError::new(ErrorCode::ConnectionInvalidBucket).param("provider", "TOS"));
    }
    let endpoint = format!("https://tos-s3-{region}.volces.com");
    let requested = requested.unwrap_or_default().trim().trim_end_matches('/');
    if !requested.is_empty() && requested != endpoint {
        return Err(AppError::new(ErrorCode::ConnectionInvalidEndpoint).param("provider", "TOS"));
    }
    Ok(endpoint)
}

#[cfg(test)]
mod tests {
    use super::tos_endpoint;

    #[test]
    fn tos_endpoint_uses_s3_region_and_bucket() {
        assert_eq!(
            tos_endpoint("cn-beijing", "assets-1", None).unwrap(),
            "https://tos-s3-cn-beijing.volces.com"
        );
        assert!(tos_endpoint("", "assets", None).is_err());
        assert!(tos_endpoint("cn-beijing", "Assets", None).is_err());
        assert!(tos_endpoint("cn-beijing", "assets", Some("https://example.com")).is_err());
    }
}
