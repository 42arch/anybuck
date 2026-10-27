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
        return Err(
            AppError::new(ErrorCode::ConnectionInvalidCredentials).param("provider", "Kodo")
        );
    }
    let endpoint = kodo_endpoint(region, bucket, request.endpoint.as_deref())?;
    let credentials = Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "cloudstore-kodo",
    );
    let shared_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .endpoint_url(&endpoint)
        .region(aws_sdk_s3::config::Region::new(region.to_string()))
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
                .unwrap_or_else(|| new_connection_id(StorageProvider::QiniuKodo)),
            name: if name.is_empty() { bucket } else { name }.to_string(),
            provider: StorageProvider::QiniuKodo,
            region: region.to_string(),
            account_id: String::new(),
            endpoint,
            bucket: bucket.to_string(),
        },
    })
}

fn kodo_endpoint(region: &str, bucket: &str, requested: Option<&str>) -> Result<String, AppError> {
    if region.is_empty()
        || !region
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        || region.starts_with('-')
        || region.ends_with('-')
    {
        return Err(AppError::new(ErrorCode::ConnectionInvalidRegion).param("provider", "Kodo"));
    }
    // Existing Kodo spaces may not follow the current space creation rules.
    // Let the S3 service decide whether the supplied S3 space name exists.
    if bucket.is_empty()
        || bucket.bytes().any(|byte| {
            byte.is_ascii_whitespace()
                || byte.is_ascii_control()
                || matches!(byte, b'/' | b'\\' | b'?' | b'#')
        })
    {
        return Err(AppError::new(ErrorCode::ConnectionInvalidBucket).param("provider", "Kodo"));
    }
    let endpoint = format!("https://s3.{region}.qiniucs.com");
    let requested = requested.unwrap_or_default().trim().trim_end_matches('/');
    if !requested.is_empty() && requested != endpoint {
        return Err(AppError::new(ErrorCode::ConnectionInvalidEndpoint).param("provider", "Kodo"));
    }
    Ok(endpoint)
}

#[cfg(test)]
mod tests {
    use super::kodo_endpoint;

    #[test]
    fn kodo_endpoint_uses_s3_region_and_space_name() {
        assert_eq!(
            kodo_endpoint("cn-east-1", "assets-1", None).unwrap(),
            "https://s3.cn-east-1.qiniucs.com"
        );
        assert_eq!(
            kodo_endpoint("cn-east-1", "tupian_api", None).unwrap(),
            "https://s3.cn-east-1.qiniucs.com"
        );
        assert!(kodo_endpoint("", "assets", None).is_err());
        assert!(kodo_endpoint("cn-east-1", "", None).is_err());
        assert!(kodo_endpoint("cn-east-1", "assets/other", None).is_err());
        assert!(kodo_endpoint("cn-east-1", "assets", Some("https://example.com")).is_err());
    }
}
