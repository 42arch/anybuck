use crate::connection::manager::{PreparedConnection, new_connection_id};
use crate::connection::model::{ConnectR2Request, SavedR2Connection, StorageProvider};
use aws_sdk_s3::{Client, config::Credentials};

pub(crate) async fn prepare_connection(
    request: &ConnectR2Request,
) -> Result<PreparedConnection, String> {
    let region = request.region.trim();
    let bucket = request.bucket.trim();
    let access_key_id = request.access_key_id.trim();
    let secret_access_key = request.secret_access_key.trim();
    if access_key_id.is_empty() || secret_access_key.is_empty() {
        return Err("请填写阿里云 AccessKey ID 和 AccessKey Secret。".to_string());
    }
    let endpoint = oss_endpoint(region, bucket, request.endpoint.as_deref())?;
    let credentials = Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "cloudstore-oss",
    );
    let shared_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .endpoint_url(&endpoint)
        .region(aws_sdk_s3::config::Region::new(region.to_string()))
        .credentials_provider(credentials)
        .load()
        .await;
    // OSS's S3-compatible API accepts only virtual-hosted-style bucket requests.
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
        profile: SavedR2Connection {
            id: request
                .connection_id
                .clone()
                .unwrap_or_else(|| new_connection_id(StorageProvider::AliyunOss)),
            name: if name.is_empty() { bucket } else { name }.to_string(),
            provider: StorageProvider::AliyunOss,
            region: region.to_string(),
            account_id: String::new(),
            endpoint,
            bucket: bucket.to_string(),
        },
    })
}

fn oss_endpoint(region: &str, bucket: &str, requested: Option<&str>) -> Result<String, String> {
    if region.is_empty()
        || !region
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        || region.starts_with('-')
        || region.ends_with('-')
    {
        return Err("请填写有效的 OSS 地域，例如 cn-hangzhou。".to_string());
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
        return Err(
            "OSS Bucket 名称应为 3–63 位小写字母、数字或连字符，且首尾不能是连字符。".to_string(),
        );
    }
    let endpoint = format!("https://s3.oss-{region}.aliyuncs.com");
    let requested = requested.unwrap_or_default().trim().trim_end_matches('/');
    if !requested.is_empty() && requested != endpoint {
        return Err("OSS Endpoint 必须与所选地域一致。".to_string());
    }
    Ok(endpoint)
}

#[cfg(test)]
mod tests {
    use super::oss_endpoint;

    #[test]
    fn oss_endpoint_uses_bucket_region() {
        assert_eq!(
            oss_endpoint("cn-hangzhou", "assets-1", None).unwrap(),
            "https://s3.oss-cn-hangzhou.aliyuncs.com"
        );
        assert_eq!(
            oss_endpoint("ap-southeast-1", "assets-1", None).unwrap(),
            "https://s3.oss-ap-southeast-1.aliyuncs.com"
        );
    }

    #[test]
    fn rejects_invalid_bucket_region_or_endpoint() {
        assert!(oss_endpoint("", "assets-1", None).is_err());
        assert!(oss_endpoint("cn-hangzhou", "Assets", None).is_err());
        assert!(oss_endpoint("cn-hangzhou", "-assets", None).is_err());
        assert!(
            oss_endpoint(
                "cn-hangzhou",
                "assets-1",
                Some("https://s3.oss-cn-beijing.aliyuncs.com")
            )
            .is_err()
        );
    }
}
