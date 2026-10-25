use super::transfer::{ProgressCallback, UploadOutcome, upload_file};
use crate::transfers::model::UploadConflictAction;
use aws_sdk_s3::{
    Client,
    error::{ProvideErrorMetadata, SdkError},
    primitives::ByteStream,
    types::{CompletedMultipartUpload, CompletedPart},
};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

static NEXT_PROBE_ID: AtomicU64 = AtomicU64::new(1);
const SAMPLE: &[u8] = b"cloudstore compatibility probe\n";
const LARGE_SIZE: u64 = 100 * 1024 * 1024;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ProbeMode {
    Quick,
    Full,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProbeCheck {
    id: &'static str,
    status: &'static str,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProbeReport {
    pub(crate) connection_id: String,
    pub(crate) bucket: String,
    pub(crate) mode: ProbeMode,
    pub(crate) prefix: String,
    pub(crate) checks: Vec<ProbeCheck>,
    pub(crate) cleanup_failures: Vec<String>,
}

struct Failure {
    status: &'static str,
    detail: String,
}

impl Failure {
    fn failed(detail: impl Into<String>) -> Self {
        Self {
            status: "failed",
            detail: detail.into(),
        }
    }
}

fn upload_failure(message: String) -> Failure {
    let status = if message.contains("AccessDenied") || message.contains("Forbidden") {
        "permissionDenied"
    } else if message.contains("NotImplemented") || message.contains("NotSupported") {
        "unsupported"
    } else {
        "failed"
    };
    Failure {
        status,
        detail: message,
    }
}

fn sdk_failure<E>(error: &SdkError<E>) -> Failure
where
    E: ProvideErrorMetadata + std::error::Error + Send + Sync + 'static,
{
    let code = error
        .as_service_error()
        .and_then(ProvideErrorMetadata::code);
    let http = error
        .raw_response()
        .map(|response| response.status().as_u16());
    let status = match (code, http) {
        (Some("AccessDenied" | "Forbidden"), _) | (_, Some(401 | 403)) => "permissionDenied",
        (Some("NotImplemented" | "NotSupported" | "UnsupportedOperation"), _) | (_, Some(501)) => {
            "unsupported"
        }
        _ => "failed",
    };
    let detail = match (code, http) {
        (Some(code), Some(http)) => format!("{code}（HTTP {http}）"),
        (Some(code), None) => code.to_string(),
        (None, Some(http)) => format!("HTTP {http}"),
        (None, None) => "请求未收到可识别的存储响应，请检查网络和 Endpoint。".to_string(),
    };
    Failure { status, detail }
}

fn is_precondition<E>(error: &SdkError<E>) -> bool
where
    E: ProvideErrorMetadata + std::error::Error + Send + Sync + 'static,
{
    error
        .as_service_error()
        .and_then(ProvideErrorMetadata::code)
        == Some("PreconditionFailed")
        || error
            .raw_response()
            .is_some_and(|response| response.status().as_u16() == 412)
}

fn conditional_failure<E>(error: &SdkError<E>) -> Failure
where
    E: ProvideErrorMetadata + std::error::Error + Send + Sync + 'static,
{
    let mut failure = sdk_failure(error);
    let http = error
        .raw_response()
        .map(|response| response.status().as_u16());
    let code = error
        .as_service_error()
        .and_then(ProvideErrorMetadata::code);
    if failure.status == "failed"
        && (matches!(http, Some(400 | 405))
            || matches!(code, Some("InvalidArgument" | "InvalidRequest")))
    {
        failure.status = "unsupported";
    }
    failure
}

fn probe_prefix() -> String {
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!(
        "__cloudstore-compat/{time}-{}-{}/",
        std::process::id(),
        NEXT_PROBE_ID.fetch_add(1, Ordering::Relaxed)
    )
}

struct ProbeResources {
    client: Client,
    bucket: String,
    prefix: String,
    keys: Vec<String>,
    uploads: Vec<(String, String)>,
}

struct LocalProbeFile(std::path::PathBuf);

impl Drop for LocalProbeFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

impl ProbeResources {
    fn key(&mut self, name: &str) -> String {
        let key = format!("{}{name}", self.prefix);
        if !self.keys.contains(&key) {
            self.keys.push(key.clone());
        }
        key
    }

    async fn cleanup(&mut self) -> Vec<String> {
        let mut failures = Vec::new();
        for (key, upload_id) in self.uploads.drain(..) {
            if let Err(error) = self
                .client
                .abort_multipart_upload()
                .bucket(&self.bucket)
                .key(&key)
                .upload_id(&upload_id)
                .send()
                .await
            {
                // A completed or previously aborted upload no longer needs cleanup.
                let http = error
                    .raw_response()
                    .map(|response| response.status().as_u16());
                if http != Some(404) {
                    failures.push(format!(
                        "未能中止 {key} 的分片 {upload_id}：{}",
                        sdk_failure(&error).detail
                    ));
                }
            }
        }
        for key in self.keys.drain(..) {
            let already_missing = self
                .client
                .head_object()
                .bucket(&self.bucket)
                .key(&key)
                .send()
                .await
                .is_err_and(|error| {
                    error
                        .raw_response()
                        .is_some_and(|response| response.status().as_u16() == 404)
                });
            if already_missing {
                continue;
            }
            if let Err(error) = self
                .client
                .delete_object()
                .bucket(&self.bucket)
                .key(&key)
                .send()
                .await
            {
                failures.push(format!("未能删除 {key}：{}", sdk_failure(&error).detail));
            }
        }
        match self
            .client
            .list_objects_v2()
            .bucket(&self.bucket)
            .prefix(&self.prefix)
            .max_keys(1)
            .send()
            .await
        {
            Ok(page) if !page.contents().is_empty() => {
                failures.push(format!("前缀 {} 下仍有对象，请手动检查。", self.prefix))
            }
            Err(error) => failures.push(format!(
                "无法确认前缀 {} 已清空：{}",
                self.prefix,
                sdk_failure(&error).detail
            )),
            _ => {}
        }
        failures
    }
}

impl Drop for ProbeResources {
    fn drop(&mut self) {
        if self.keys.is_empty() && self.uploads.is_empty() {
            return;
        }
        let client = self.client.clone();
        let bucket = self.bucket.clone();
        let keys = std::mem::take(&mut self.keys);
        let uploads = std::mem::take(&mut self.uploads);
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                for (key, upload_id) in uploads {
                    let _ = client
                        .abort_multipart_upload()
                        .bucket(&bucket)
                        .key(key)
                        .upload_id(upload_id)
                        .send()
                        .await;
                }
                for key in keys {
                    let _ = client.delete_object().bucket(&bucket).key(key).send().await;
                }
            });
        }
    }
}

fn record(checks: &mut Vec<ProbeCheck>, id: &'static str, result: Result<String, Failure>) -> bool {
    match result {
        Ok(detail) => {
            checks.push(ProbeCheck {
                id,
                status: "passed",
                detail,
            });
            true
        }
        Err(error) => {
            checks.push(ProbeCheck {
                id,
                status: error.status,
                detail: error.detail,
            });
            false
        }
    }
}

fn skipped(checks: &mut Vec<ProbeCheck>, id: &'static str, reason: &str) {
    checks.push(ProbeCheck {
        id,
        status: "skipped",
        detail: reason.to_string(),
    });
}

async fn read_exact(
    client: &Client,
    bucket: &str,
    key: &str,
    expected: &[u8],
) -> Result<(), Failure> {
    let head = client
        .head_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    if head.content_length() != Some(expected.len() as i64) {
        return Err(Failure::failed("HEAD 返回的对象大小与写入内容不一致。"));
    }
    let object = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let bytes = object
        .body
        .collect()
        .await
        .map_err(|_| Failure::failed("读取对象内容失败。"))?
        .into_bytes();
    if bytes.as_ref() != expected {
        return Err(Failure::failed("GET 返回的对象内容与写入内容不一致。"));
    }
    Ok(())
}

async fn conditional_put(resources: &mut ProbeResources) -> Result<String, Failure> {
    let key = resources.key("conditional-put.txt");
    let client = &resources.client;
    let bucket = &resources.bucket;
    client
        .put_object()
        .bucket(bucket)
        .key(&key)
        .if_none_match("*")
        .body(ByteStream::from_static(SAMPLE))
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let rejected = client
        .put_object()
        .bucket(bucket)
        .key(&key)
        .if_none_match("*")
        .body(ByteStream::from_static(b"should not replace"))
        .send()
        .await;
    match rejected {
        Err(error) if is_precondition(&error) => {
            read_exact(client, bucket, &key, SAMPLE).await?;
            Ok("首次条件写入成功；同名写入返回 412，原内容保持不变。".to_string())
        }
        Err(error) => Err(conditional_failure(&error)),
        Ok(_) => Err(Failure::failed(
            "同名条件写入被接受；此服务不能安全执行“跳过同名”上传。",
        )),
    }
}

async fn pagination(resources: &mut ProbeResources) -> Result<String, Failure> {
    let first = resources.key("pagination/one.txt");
    let second = resources.key("pagination/two.txt");
    for key in [&first, &second] {
        resources
            .client
            .put_object()
            .bucket(&resources.bucket)
            .key(key)
            .body(ByteStream::from_static(SAMPLE))
            .send()
            .await
            .map_err(|error| sdk_failure(&error))?;
    }
    let prefix = format!("{}pagination/", resources.prefix);
    let first_page = resources
        .client
        .list_objects_v2()
        .bucket(&resources.bucket)
        .prefix(&prefix)
        .max_keys(1)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let token = first_page
        .next_continuation_token()
        .ok_or_else(|| Failure::failed("第一页未返回 continuation token。"))?;
    let second_page = resources
        .client
        .list_objects_v2()
        .bucket(&resources.bucket)
        .prefix(&prefix)
        .max_keys(1)
        .continuation_token(token)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let listed = first_page
        .contents()
        .iter()
        .chain(second_page.contents().iter())
        .filter_map(|item| item.key())
        .collect::<Vec<_>>();
    if !listed.contains(&first.as_str()) || !listed.contains(&second.as_str()) {
        return Err(Failure::failed("分页结果未包含两个测试对象。"));
    }
    Ok("max_keys=1 的两页均返回预期对象。".to_string())
}

async fn copy_delete(resources: &mut ProbeResources, source: &str) -> Result<String, Failure> {
    let copied = resources.key("copied.txt");
    // CopySource must be URL-encoded when bucket or key contains reserved characters.
    let copy_source = format!("{}/{}", resources.bucket, source);
    resources
        .client
        .copy_object()
        .bucket(&resources.bucket)
        .key(&copied)
        .copy_source(copy_source)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    read_exact(&resources.client, &resources.bucket, &copied, SAMPLE).await?;
    resources
        .client
        .delete_object()
        .bucket(&resources.bucket)
        .key(&copied)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let missing = resources
        .client
        .head_object()
        .bucket(&resources.bucket)
        .key(&copied)
        .send()
        .await;
    if !missing.is_err_and(|error| {
        error
            .raw_response()
            .is_some_and(|response| response.status().as_u16() == 404)
    }) {
        return Err(Failure::failed("删除后 HEAD 未返回 404。"));
    }
    Ok("CopyObject 内容一致，DeleteObject 后对象不可见。".to_string())
}

async fn multipart_upload(resources: &mut ProbeResources) -> Result<String, Failure> {
    let path = std::env::temp_dir().join(format!(
        "cloudstore-compat-{}-{}.bin",
        std::process::id(),
        NEXT_PROBE_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| Failure::failed(format!("无法创建本地临时文件：{error}")))?;
    let _local_file = LocalProbeFile(path.clone());
    let result = file
        .set_len(LARGE_SIZE)
        .map_err(|error| Failure::failed(format!("无法准备本地临时文件：{error}")));
    drop(file);
    result?;
    let key = resources.key(
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("large.bin"),
    );
    let outcome = upload_file(
        &resources.client,
        &resources.bucket,
        resources.prefix.trim_end_matches('/'),
        &path,
        UploadConflictAction::Skip,
        Arc::new(|_, _| {}) as ProgressCallback,
    )
    .await;
    match outcome {
        Ok(UploadOutcome::Uploaded(uploaded)) if uploaded == key => {}
        Ok(_) => return Err(Failure::failed("分片上传未得到预期的新对象。")),
        Err(error) => return Err(upload_failure(error)),
    }
    let head = resources
        .client
        .head_object()
        .bucket(&resources.bucket)
        .key(&key)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    if head.content_length() != Some(LARGE_SIZE as i64) {
        return Err(Failure::failed("完成分片后对象大小不正确。"));
    }
    let body = resources
        .client
        .get_object()
        .bucket(&resources.bucket)
        .key(&key)
        .range("bytes=0-31")
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?
        .body
        .collect()
        .await
        .map_err(|_| Failure::failed("分片对象的范围读取失败。"))?
        .into_bytes();
    if body.len() != 32 || body.iter().any(|byte| *byte != 0) {
        return Err(Failure::failed("分片对象读回的数据不正确。"));
    }
    Ok("使用应用上传路径完成 100 MiB 分片上传，并验证大小与范围读取。".to_string())
}

async fn multipart_abort(resources: &mut ProbeResources) -> Result<String, Failure> {
    let key = resources.key("aborted.bin");
    let started = resources
        .client
        .create_multipart_upload()
        .bucket(&resources.bucket)
        .key(&key)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let upload_id = started
        .upload_id()
        .ok_or_else(|| Failure::failed("服务端未返回 upload ID。"))?
        .to_string();
    resources.uploads.push((key.clone(), upload_id.clone()));
    resources
        .client
        .upload_part()
        .bucket(&resources.bucket)
        .key(&key)
        .upload_id(&upload_id)
        .part_number(1)
        .body(ByteStream::from(vec![0u8; 5 * 1024 * 1024]))
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    resources
        .client
        .abort_multipart_upload()
        .bucket(&resources.bucket)
        .key(&key)
        .upload_id(&upload_id)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    resources.uploads.retain(|(_, id)| id != &upload_id);
    Ok("创建并上传 5 MiB 分片后成功中止。".to_string())
}

async fn conditional_complete(resources: &mut ProbeResources) -> Result<String, Failure> {
    let key = resources.key("conditional-complete.txt");
    resources
        .client
        .put_object()
        .bucket(&resources.bucket)
        .key(&key)
        .body(ByteStream::from_static(SAMPLE))
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let started = resources
        .client
        .create_multipart_upload()
        .bucket(&resources.bucket)
        .key(&key)
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let upload_id = started
        .upload_id()
        .ok_or_else(|| Failure::failed("服务端未返回 upload ID。"))?
        .to_string();
    resources.uploads.push((key.clone(), upload_id.clone()));
    let part = resources
        .client
        .upload_part()
        .bucket(&resources.bucket)
        .key(&key)
        .upload_id(&upload_id)
        .part_number(1)
        .body(ByteStream::from(vec![1u8; 5 * 1024 * 1024]))
        .send()
        .await
        .map_err(|error| sdk_failure(&error))?;
    let etag = part
        .e_tag()
        .ok_or_else(|| Failure::failed("上传分片未返回 ETag。"))?;
    let parts = CompletedMultipartUpload::builder()
        .parts(CompletedPart::builder().part_number(1).e_tag(etag).build())
        .build();
    let result = resources
        .client
        .complete_multipart_upload()
        .bucket(&resources.bucket)
        .key(&key)
        .upload_id(&upload_id)
        .multipart_upload(parts)
        .if_none_match("*")
        .send()
        .await;
    match result {
        Err(error) if is_precondition(&error) => {
            read_exact(&resources.client, &resources.bucket, &key, SAMPLE).await?;
            Ok("同名分片完成返回 412，原对象未被覆盖。".to_string())
        }
        Err(error) => Err(conditional_failure(&error)),
        Ok(_) => Err(Failure::failed(
            "同名分片完成被接受；此服务不能安全执行分片上传的“跳过同名”。",
        )),
    }
}

pub(crate) async fn run_probe(
    client: Client,
    bucket: String,
    connection_id: String,
    mode: ProbeMode,
) -> ProbeReport {
    let mut resources = ProbeResources {
        client,
        bucket: bucket.clone(),
        prefix: probe_prefix(),
        keys: Vec::new(),
        uploads: Vec::new(),
    };
    let mut checks = Vec::new();
    let initial = resources
        .client
        .list_objects_v2()
        .bucket(&bucket)
        .prefix(&resources.prefix)
        .max_keys(1)
        .send()
        .await;
    let can_start = record(
        &mut checks,
        "list",
        match initial {
            Ok(page) if page.contents().is_empty() => {
                Ok("隔离前缀可列举，且未发现已有对象。".to_string())
            }
            Ok(_) => Err(Failure::failed("随机测试前缀已有对象，已停止写入。")),
            Err(error) => Err(sdk_failure(&error)),
        },
    );
    if can_start {
        let source = resources.key("source.txt");
        let basic = async {
            resources
                .client
                .put_object()
                .bucket(&bucket)
                .key(&source)
                .body(ByteStream::from_static(SAMPLE))
                .send()
                .await
                .map_err(|error| sdk_failure(&error))?;
            read_exact(&resources.client, &bucket, &source, SAMPLE).await?;
            Ok("PUT、HEAD、GET 成功且内容一致。".to_string())
        }
        .await;
        let basic_ok = record(&mut checks, "basicReadWrite", basic);
        record(
            &mut checks,
            "conditionalPut",
            conditional_put(&mut resources).await,
        );
        if basic_ok {
            record(&mut checks, "pagination", pagination(&mut resources).await);
            record(
                &mut checks,
                "copyDelete",
                copy_delete(&mut resources, &source).await,
            );
        } else {
            skipped(&mut checks, "pagination", "基础写入或读取失败。");
            skipped(&mut checks, "copyDelete", "基础写入或读取失败。");
        }
        if matches!(mode, ProbeMode::Full) {
            record(
                &mut checks,
                "multipartUpload",
                multipart_upload(&mut resources).await,
            );
            record(
                &mut checks,
                "multipartAbort",
                multipart_abort(&mut resources).await,
            );
            record(
                &mut checks,
                "conditionalComplete",
                conditional_complete(&mut resources).await,
            );
        }
    } else {
        for id in [
            "basicReadWrite",
            "conditionalPut",
            "pagination",
            "copyDelete",
        ] {
            skipped(&mut checks, id, "无法安全确认隔离前缀为空。");
        }
        if matches!(mode, ProbeMode::Full) {
            for id in ["multipartUpload", "multipartAbort", "conditionalComplete"] {
                skipped(&mut checks, id, "无法安全确认隔离前缀为空。");
            }
        }
    }
    let cleanup_failures = if can_start {
        resources.cleanup().await
    } else {
        Vec::new()
    };
    ProbeReport {
        connection_id,
        bucket,
        mode,
        prefix: resources.prefix.clone(),
        checks,
        cleanup_failures,
    }
}

#[cfg(test)]
mod tests {
    use super::probe_prefix;

    #[test]
    fn probe_prefix_is_unique_and_isolated() {
        let first = probe_prefix();
        let second = probe_prefix();
        assert!(first.starts_with("__cloudstore-compat/"));
        assert!(first.ends_with('/'));
        assert_ne!(first, second);
    }
}
