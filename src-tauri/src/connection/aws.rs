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
    let endpoint = aws_endpoint(region, bucket, request.endpoint.as_deref())?;
    if access_key_id.is_empty() || secret_access_key.is_empty() {
        return Err("请填写 AWS Access Key ID 和 Secret Access Key。".to_string());
    }

    let session_token = request.session_token.trim();
    let credentials = Credentials::new(
        access_key_id,
        secret_access_key,
        if session_token.is_empty() {
            None
        } else {
            Some(session_token.to_string())
        },
        None,
        "cloudstore-aws-s3",
    );
    // Let the AWS SDK resolve the regional S3 endpoint, including AWS partitions.
    let shared_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(aws_sdk_s3::config::Region::new(region.to_string()))
        .credentials_provider(credentials)
        .load()
        .await;
    let name = request.name.trim();
    Ok(PreparedConnection {
        client: Client::new(&shared_config),
        profile: SavedR2Connection {
            id: request
                .connection_id
                .clone()
                .unwrap_or_else(|| new_connection_id(StorageProvider::AwsS3)),
            name: if name.is_empty() { bucket } else { name }.to_string(),
            provider: StorageProvider::AwsS3,
            region: region.to_string(),
            account_id: String::new(),
            endpoint,
            bucket: bucket.to_string(),
        },
    })
}

fn aws_endpoint(region: &str, bucket: &str, requested: Option<&str>) -> Result<String, String> {
    if region.is_empty()
        || !region
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        || region.starts_with('-')
        || region.ends_with('-')
    {
        return Err("请填写有效的 AWS Region，例如 us-east-1。".to_string());
    }
    let valid_bucket = (3..=63).contains(&bucket.len())
        && bucket.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'.'
        })
        && bucket
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && bucket
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
        && !bucket.contains("..")
        && !bucket.contains(".-")
        && !bucket.contains("-.");
    if !valid_bucket {
        return Err("AWS S3 Bucket 名称应为 3–63 位小写字母、数字、句点或连字符。".to_string());
    }
    let domain = if region.starts_with("cn-") {
        "amazonaws.com.cn"
    } else {
        "amazonaws.com"
    };
    let endpoint = format!("https://s3.{region}.{domain}");
    let requested = requested.unwrap_or_default().trim().trim_end_matches('/');
    if !requested.is_empty() && requested != endpoint {
        return Err("AWS S3 Endpoint 必须与所选地域一致。".to_string());
    }
    Ok(endpoint)
}

#[cfg(test)]
mod tests {
    use super::aws_endpoint;

    #[test]
    fn resolves_standard_and_china_region_endpoints() {
        assert_eq!(
            aws_endpoint("us-east-1", "my-bucket", None).unwrap(),
            "https://s3.us-east-1.amazonaws.com"
        );
        assert_eq!(
            aws_endpoint("cn-north-1", "my.bucket", None).unwrap(),
            "https://s3.cn-north-1.amazonaws.com.cn"
        );
    }

    #[test]
    fn rejects_invalid_region_bucket_or_saved_endpoint() {
        assert!(aws_endpoint("", "my-bucket", None).is_err());
        assert!(aws_endpoint("us-east-1", "my_bucket", None).is_err());
        assert!(aws_endpoint("us-east-1", "my..bucket", None).is_err());
        assert!(
            aws_endpoint(
                "us-east-1",
                "my-bucket",
                Some("https://s3.eu-west-1.amazonaws.com")
            )
            .is_err()
        );
    }
}
