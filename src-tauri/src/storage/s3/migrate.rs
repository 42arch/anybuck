use super::copy::{CopyCheckpoint, target_exists};
use super::multipart::{MULTIPART_THRESHOLD, MultipartCleanup, multipart_part_size};
use super::transfer::{ProgressCallback, progress_body_from_path};
use crate::error::{AppError, ErrorCode};
use aws_sdk_s3::{
    Client,
    primitives::ByteStream,
    types::{CompletedMultipartUpload, CompletedPart},
};
use std::path::PathBuf;
use tokio::{
    fs::{File, OpenOptions},
    io::{AsyncReadExt, AsyncWriteExt},
};

#[allow(clippy::too_many_arguments)]
pub(crate) async fn copy_across_connections(
    source_client: &Client,
    source_bucket: &str,
    source_key: &str,
    target_client: &Client,
    target_bucket: &str,
    target_key: &str,
    task_id: &str,
    verify_contents: bool,
    on_progress: &ProgressCallback,
    on_phase: &(dyn Fn(&str) + Send + Sync),
) -> Result<CopyCheckpoint, AppError> {
    if target_exists(target_client, target_bucket, target_key, false).await? {
        return Err(AppError::new(ErrorCode::TransferConflict));
    }
    let source_head = source_client
        .head_object()
        .bucket(source_bucket)
        .key(source_key)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    let size = u64::try_from(
        source_head
            .content_length()
            .ok_or_else(|| AppError::new(ErrorCode::StorageResponseInvalid))?,
    )
    .map_err(|_| AppError::new(ErrorCode::StorageResponseInvalid))?;
    let source_etag = source_head
        .e_tag()
        .ok_or_else(|| AppError::new(ErrorCode::StorageResponseInvalid))?
        .to_string();
    let temp_path = std::env::temp_dir().join(format!(
        "{}-migration-{task_id}.part",
        crate::constants::APP_NAME
    ));

    on_phase("downloading");
    on_progress(0, Some(size));
    let output = source_client
        .get_object()
        .bucket(source_bucket)
        .key(source_key)
        .if_match(&source_etag)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    let mut body = output.body.into_async_read();
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(&temp_path).await.map_err(|error| {
        AppError::with_detail(ErrorCode::TransferLocalWriteFailed, error.to_string())
    })?;
    let _cleanup = TemporaryFile(temp_path.clone());
    let mut buffer = [0u8; 64 * 1024];
    let mut downloaded = 0u64;
    loop {
        let count = body.read(&mut buffer).await.map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
        if count == 0 {
            break;
        }
        file.write_all(&buffer[..count]).await.map_err(|error| {
            AppError::with_detail(ErrorCode::TransferLocalWriteFailed, error.to_string())
        })?;
        downloaded += count as u64;
        on_progress(downloaded, Some(size));
    }
    file.flush().await.map_err(|error| {
        AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
    })?;
    drop(file);
    if downloaded != size {
        return Err(AppError::new(ErrorCode::TransferVerificationFailed));
    }

    let source_after_download = source_client
        .head_object()
        .bucket(source_bucket)
        .key(source_key)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    if source_after_download.content_length() != Some(size as i64)
        || source_after_download.e_tag() != Some(source_etag.as_str())
    {
        return Err(AppError::new(ErrorCode::TransferSourceChanged));
    }
    if target_exists(target_client, target_bucket, target_key, false).await? {
        return Err(AppError::new(ErrorCode::TransferConflict));
    }

    on_phase("uploading");
    on_progress(0, Some(size));
    if size < MULTIPART_THRESHOLD {
        let body = progress_body_from_path(&temp_path, size, on_progress.clone()).await?;
        let mut request = target_client
            .put_object()
            .bucket(target_bucket)
            .key(target_key)
            .if_none_match("*")
            .content_length(size as i64)
            .body(body);
        if let Some(value) = source_head.content_type() {
            request = request.content_type(value);
        }
        if let Some(value) = source_head.cache_control() {
            request = request.cache_control(value);
        }
        if let Some(value) = source_head.content_disposition() {
            request = request.content_disposition(value);
        }
        if let Some(value) = source_head.content_encoding() {
            request = request.content_encoding(value);
        }
        if let Some(value) = source_head.content_language() {
            request = request.content_language(value);
        }
        if let Some(metadata) = source_head.metadata() {
            request = request.set_metadata(Some(metadata.clone()));
        }
        request.send().await.map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
        on_progress(size, Some(size));
    } else {
        upload_multipart(
            target_client,
            target_bucket,
            target_key,
            &temp_path,
            size,
            source_head.content_type(),
            source_head.cache_control(),
            source_head.content_disposition(),
            source_head.content_encoding(),
            source_head.content_language(),
            source_head.metadata().cloned(),
            on_progress,
        )
        .await?;
    }

    on_phase("verifying");
    let target_head = target_client
        .head_object()
        .bucket(target_bucket)
        .key(target_key)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    if target_head.content_length() != Some(size as i64) {
        return Err(AppError::new(ErrorCode::TransferVerificationFailed));
    }
    let target_etag = target_head
        .e_tag()
        .ok_or_else(|| AppError::new(ErrorCode::StorageResponseInvalid))?
        .to_string();
    if verify_contents {
        let target_output = target_client
            .get_object()
            .bucket(target_bucket)
            .key(target_key)
            .if_match(&target_etag)
            .send()
            .await
            .map_err(|error| {
                AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
            })?;
        let mut target_body = target_output.body.into_async_read();
        let mut local = File::open(&temp_path).await.map_err(|error| {
            AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
        })?;
        let mut expected = [0u8; 64 * 1024];
        let mut received = 0u64;
        loop {
            let count = target_body.read(&mut buffer).await.map_err(|error| {
                AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
            })?;
            if count == 0 {
                break;
            }
            local
                .read_exact(&mut expected[..count])
                .await
                .map_err(|error| {
                    AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
                })?;
            if buffer[..count] != expected[..count] {
                return Err(AppError::new(ErrorCode::TransferVerificationFailed));
            }
            received += count as u64;
        }
        if received != size {
            return Err(AppError::new(ErrorCode::TransferVerificationFailed));
        }
    }
    let source_after_upload = source_client
        .head_object()
        .bucket(source_bucket)
        .key(source_key)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    if source_after_upload.content_length() != Some(size as i64)
        || source_after_upload.e_tag() != Some(source_etag.as_str())
    {
        return Err(AppError::new(ErrorCode::TransferSourceChanged));
    }
    Ok(CopyCheckpoint {
        source_etag,
        target_etag,
        size,
    })
}

#[allow(clippy::too_many_arguments)]
async fn upload_multipart(
    client: &Client,
    bucket: &str,
    key: &str,
    path: &PathBuf,
    size: u64,
    content_type: Option<&str>,
    cache_control: Option<&str>,
    content_disposition: Option<&str>,
    content_encoding: Option<&str>,
    content_language: Option<&str>,
    metadata: Option<std::collections::HashMap<String, String>>,
    on_progress: &ProgressCallback,
) -> Result<(), AppError> {
    let part_size = multipart_part_size(size)?;
    let mut create = client.create_multipart_upload().bucket(bucket).key(key);
    if let Some(value) = content_type {
        create = create.content_type(value);
    }
    if let Some(value) = cache_control {
        create = create.cache_control(value);
    }
    if let Some(value) = content_disposition {
        create = create.content_disposition(value);
    }
    if let Some(value) = content_encoding {
        create = create.content_encoding(value);
    }
    if let Some(value) = content_language {
        create = create.content_language(value);
    }
    if let Some(value) = metadata {
        create = create.set_metadata(Some(value));
    }
    let started = create.send().await.map_err(|error| {
        AppError::with_detail(ErrorCode::TransferMultipartFailed, error.to_string())
    })?;
    let upload_id = started
        .upload_id()
        .ok_or_else(|| AppError::new(ErrorCode::TransferMultipartFailed))?
        .to_string();
    let mut cleanup = MultipartCleanup::new(client, bucket, key, upload_id.clone());
    let result = async {
        let mut file = File::open(path).await.map_err(|error| {
            AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
        })?;
        let mut parts = Vec::new();
        let mut transferred = 0u64;
        let mut part_number = 1;
        while transferred < size {
            let part_len = (size - transferred).min(part_size) as usize;
            let mut chunk = vec![0u8; part_len];
            file.read_exact(&mut chunk).await.map_err(|error| {
                AppError::with_detail(ErrorCode::TransferMultipartFailed, error.to_string())
                    .param("part", part_number)
            })?;
            let uploaded = client
                .upload_part()
                .bucket(bucket)
                .key(key)
                .upload_id(&upload_id)
                .part_number(part_number)
                .body(ByteStream::from(chunk))
                .send()
                .await
                .map_err(|error| {
                    AppError::with_detail(ErrorCode::TransferMultipartFailed, error.to_string())
                        .param("part", part_number)
                })?;
            let etag = uploaded.e_tag().ok_or_else(|| {
                AppError::new(ErrorCode::StorageResponseInvalid).param("part", part_number)
            })?;
            parts.push(
                CompletedPart::builder()
                    .part_number(part_number)
                    .e_tag(etag)
                    .build(),
            );
            transferred += part_len as u64;
            part_number += 1;
            on_progress(transferred, Some(size));
        }
        client
            .complete_multipart_upload()
            .bucket(bucket)
            .key(key)
            .upload_id(&upload_id)
            .multipart_upload(
                CompletedMultipartUpload::builder()
                    .set_parts(Some(parts))
                    .build(),
            )
            .if_none_match("*")
            .send()
            .await
            .map_err(|error| {
                AppError::with_detail(ErrorCode::TransferMultipartFailed, error.to_string())
            })?;
        Ok::<(), AppError>(())
    }
    .await;
    if result.is_ok() {
        cleanup.disarm();
    }
    result
}

struct TemporaryFile(PathBuf);

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
