use aws_sdk_s3::Client;

pub(super) const MULTIPART_THRESHOLD: u64 = 100 * 1024 * 1024;
pub(super) const PART_SIZE: u64 = 16 * 1024 * 1024;

pub(super) fn multipart_part_size(size: u64) -> Result<u64, String> {
    let required = size.div_ceil(10_000).div_ceil(1024 * 1024) * 1024 * 1024;
    let part_size = required.clamp(PART_SIZE, 64 * 1024 * 1024);
    if size.div_ceil(part_size) > 10_000 {
        return Err("对象超过当前分片上传上限。".to_string());
    }
    Ok(part_size)
}

pub(super) struct MultipartCleanup {
    client: Client,
    bucket: String,
    key: String,
    upload_id: Option<String>,
}

impl MultipartCleanup {
    pub(super) fn new(client: &Client, bucket: &str, key: &str, upload_id: String) -> Self {
        Self {
            client: client.clone(),
            bucket: bucket.to_string(),
            key: key.to_string(),
            upload_id: Some(upload_id),
        }
    }

    pub(super) fn disarm(&mut self) {
        self.upload_id = None;
    }
}

impl Drop for MultipartCleanup {
    fn drop(&mut self) {
        let Some(upload_id) = self.upload_id.take() else {
            return;
        };
        let client = self.client.clone();
        let bucket = self.bucket.clone();
        let key = self.key.clone();
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                let _ = client
                    .abort_multipart_upload()
                    .bucket(bucket)
                    .key(key)
                    .upload_id(upload_id)
                    .send()
                    .await;
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{MULTIPART_THRESHOLD, PART_SIZE, multipart_part_size};

    #[test]
    fn part_size_respects_threshold_part_count_and_memory_limit() {
        assert_eq!(multipart_part_size(MULTIPART_THRESHOLD).unwrap(), PART_SIZE);
        let large = 200 * 1024 * 1024 * 1024u64;
        let part_size = multipart_part_size(large).unwrap();
        assert!(large.div_ceil(part_size) <= 10_000);
        assert!(part_size <= 64 * 1024 * 1024);
        assert!(multipart_part_size(1024 * 1024 * 1024 * 1024).is_err());
    }
}
