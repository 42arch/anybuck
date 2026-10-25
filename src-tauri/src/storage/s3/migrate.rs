use super::copy::{CopyCheckpoint, target_exists};
use super::multipart::{MULTIPART_THRESHOLD, MultipartCleanup, multipart_part_size};
use super::transfer::{ProgressCallback, progress_body_from_path};
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
) -> Result<CopyCheckpoint, String> {
    if target_exists(target_client, target_bucket, target_key, false).await? {
        return Err("目标位置已有同名项目，未覆盖。".to_string());
    }
    let source_head = source_client
        .head_object()
        .bucket(source_bucket)
        .key(source_key)
        .send()
        .await
        .map_err(|error| format!("无法读取源对象：{error}"))?;
    let size = u64::try_from(
        source_head
            .content_length()
            .ok_or_else(|| "无法获取源对象大小。".to_string())?,
    )
    .map_err(|_| "源对象大小无效。".to_string())?;
    let source_etag = source_head
        .e_tag()
        .ok_or_else(|| "源对象缺少 ETag，无法安全地执行迁移。".to_string())?
        .to_string();
    let temp_path = std::env::temp_dir().join(format!("cloudstore-migration-{task_id}.part"));

    on_phase("downloading");
    on_progress(0, Some(size));
    let output = source_client
        .get_object()
        .bucket(source_bucket)
        .key(source_key)
        .if_match(&source_etag)
        .send()
        .await
        .map_err(|error| format!("读取源对象失败：{error}"))?;
    let mut body = output.body.into_async_read();
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options
        .open(&temp_path)
        .await
        .map_err(|error| format!("无法创建迁移临时文件：{error}"))?;
    let _cleanup = TemporaryFile(temp_path.clone());
    let mut buffer = [0u8; 64 * 1024];
    let mut downloaded = 0u64;
    loop {
        let count = body
            .read(&mut buffer)
            .await
            .map_err(|error| format!("下载源对象失败：{error}"))?;
        if count == 0 {
            break;
        }
        file.write_all(&buffer[..count])
            .await
            .map_err(|error| format!("写入迁移临时文件失败：{error}"))?;
        downloaded += count as u64;
        on_progress(downloaded, Some(size));
    }
    file.flush()
        .await
        .map_err(|error| format!("保存迁移临时文件失败：{error}"))?;
    drop(file);
    if downloaded != size {
        return Err("源对象下载不完整，未上传目标对象。".to_string());
    }

    let source_after_download = source_client
        .head_object()
        .bucket(source_bucket)
        .key(source_key)
        .send()
        .await
        .map_err(|error| format!("无法确认源对象状态：{error}"))?;
    if source_after_download.content_length() != Some(size as i64)
        || source_after_download.e_tag() != Some(source_etag.as_str())
    {
        return Err("源对象在下载期间发生变化，未上传目标对象。".to_string());
    }
    if target_exists(target_client, target_bucket, target_key, false).await? {
        return Err("目标位置已有同名项目，未覆盖。".to_string());
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
        request
            .send()
            .await
            .map_err(|error| format!("上传目标对象失败：{error}"))?;
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
        .map_err(|error| format!("已上传目标对象，但无法验证：{error}"))?;
    if target_head.content_length() != Some(size as i64) {
        return Err("已上传目标对象，但目标大小与源对象不一致。".to_string());
    }
    let target_etag = target_head
        .e_tag()
        .ok_or_else(|| "已上传目标对象，但目标缺少 ETag，未删除源对象。".to_string())?
        .to_string();
    if verify_contents {
        let target_output = target_client
            .get_object()
            .bucket(target_bucket)
            .key(target_key)
            .if_match(&target_etag)
            .send()
            .await
            .map_err(|error| format!("无法读取目标对象进行内容验证，未删除源对象：{error}"))?;
        let mut target_body = target_output.body.into_async_read();
        let mut local = File::open(&temp_path)
            .await
            .map_err(|error| format!("无法读取迁移临时文件进行验证：{error}"))?;
        let mut expected = [0u8; 64 * 1024];
        let mut received = 0u64;
        loop {
            let count = target_body
                .read(&mut buffer)
                .await
                .map_err(|error| format!("读取目标对象进行验证失败：{error}"))?;
            if count == 0 {
                break;
            }
            local
                .read_exact(&mut expected[..count])
                .await
                .map_err(|error| format!("读取迁移临时文件进行验证失败：{error}"))?;
            if buffer[..count] != expected[..count] {
                return Err("目标内容与源对象不一致，未删除源对象。".to_string());
            }
            received += count as u64;
        }
        if received != size {
            return Err("目标内容不完整，未删除源对象。".to_string());
        }
    }
    let source_after_upload = source_client
        .head_object()
        .bucket(source_bucket)
        .key(source_key)
        .send()
        .await
        .map_err(|error| format!("已上传目标对象，但无法确认源对象状态：{error}"))?;
    if source_after_upload.content_length() != Some(size as i64)
        || source_after_upload.e_tag() != Some(source_etag.as_str())
    {
        return Err("已上传目标对象，但源对象发生变化，未删除源对象。".to_string());
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
) -> Result<(), String> {
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
    let started = create
        .send()
        .await
        .map_err(|error| format!("无法开始目标分片上传：{error}"))?;
    let upload_id = started
        .upload_id()
        .ok_or_else(|| "目标未返回分片上传 ID。".to_string())?
        .to_string();
    let mut cleanup = MultipartCleanup::new(client, bucket, key, upload_id.clone());
    let result = async {
        let mut file = File::open(path)
            .await
            .map_err(|error| format!("无法读取迁移临时文件：{error}"))?;
        let mut parts = Vec::new();
        let mut transferred = 0u64;
        let mut part_number = 1;
        while transferred < size {
            let part_len = (size - transferred).min(part_size) as usize;
            let mut chunk = vec![0u8; part_len];
            file.read_exact(&mut chunk)
                .await
                .map_err(|error| format!("读取第 {part_number} 个分片失败：{error}"))?;
            let uploaded = client
                .upload_part()
                .bucket(bucket)
                .key(key)
                .upload_id(&upload_id)
                .part_number(part_number)
                .body(ByteStream::from(chunk))
                .send()
                .await
                .map_err(|error| format!("上传第 {part_number} 个分片失败：{error}"))?;
            let etag = uploaded
                .e_tag()
                .ok_or_else(|| format!("第 {part_number} 个分片缺少 ETag。"))?;
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
            .map_err(|error| format!("完成目标分片上传失败：{error}"))?;
        Ok::<(), String>(())
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
