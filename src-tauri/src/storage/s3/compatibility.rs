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
    collections::BTreeMap,
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
    diagnostic: ProbeDiagnostic,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProbeDiagnostic {
    code: String,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    params: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

impl ProbeDiagnostic {
    fn new(code: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            params: BTreeMap::new(),
            detail: None,
        }
    }

    fn param(mut self, key: &str, value: impl ToString) -> Self {
        self.params.insert(key.to_string(), value.to_string());
        self
    }

    fn detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProbeReport {
    pub(crate) connection_id: String,
    pub(crate) bucket: String,
    pub(crate) mode: ProbeMode,
    pub(crate) prefix: String,
    pub(crate) checks: Vec<ProbeCheck>,
    pub(crate) cleanup_failures: Vec<ProbeDiagnostic>,
}

struct Failure {
    status: &'static str,
    diagnostic: ProbeDiagnostic,
}

impl Failure {
    fn failed(code: &'static str) -> Self {
        Self {
            status: "failed",
            diagnostic: ProbeDiagnostic::new(code),
        }
    }

    fn detail(mut self, detail: impl Into<String>) -> Self {
        self.diagnostic = self.diagnostic.detail(detail);
        self
    }
}

fn upload_failure(error: crate::error::AppError) -> Failure {
    let code = error.code_key();
    Failure {
        status: "failed",
        diagnostic: ProbeDiagnostic {
            code,
            params: error.params,
            detail: error.detail,
        },
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
        (Some(code), Some(http)) => format!("{code} (HTTP {http})"),
        (Some(code), None) => code.to_string(),
        (None, Some(http)) => format!("HTTP {http}"),
        (None, None) => String::new(),
    };
    Failure {
        status,
        diagnostic: ProbeDiagnostic::new("remoteError").detail(detail),
    }
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

    async fn cleanup(&mut self) -> Vec<ProbeDiagnostic> {
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
                    failures.push(
                        ProbeDiagnostic::new("cleanupAbortFailed")
                            .param("key", &key)
                            .param("uploadId", &upload_id)
                            .detail(sdk_failure(&error).diagnostic.detail.unwrap_or_default()),
                    );
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
                failures.push(
                    ProbeDiagnostic::new("cleanupDeleteFailed")
                        .param("key", &key)
                        .detail(sdk_failure(&error).diagnostic.detail.unwrap_or_default()),
                );
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
            Ok(page) if !page.contents().is_empty() => failures
                .push(ProbeDiagnostic::new("cleanupObjectsRemain").param("prefix", &self.prefix)),
            Err(error) => failures.push(
                ProbeDiagnostic::new("cleanupVerifyFailed")
                    .param("prefix", &self.prefix)
                    .detail(sdk_failure(&error).diagnostic.detail.unwrap_or_default()),
            ),
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

fn record(
    checks: &mut Vec<ProbeCheck>,
    id: &'static str,
    result: Result<&'static str, Failure>,
) -> bool {
    match result {
        Ok(code) => {
            checks.push(ProbeCheck {
                id,
                status: "passed",
                diagnostic: ProbeDiagnostic::new(code),
            });
            true
        }
        Err(error) => {
            checks.push(ProbeCheck {
                id,
                status: error.status,
                diagnostic: error.diagnostic,
            });
            false
        }
    }
}

fn skipped(checks: &mut Vec<ProbeCheck>, id: &'static str, code: &'static str) {
    checks.push(ProbeCheck {
        id,
        status: "skipped",
        diagnostic: ProbeDiagnostic::new(code),
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
        return Err(Failure::failed("headSizeMismatch"));
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
        .map_err(|_| Failure::failed("objectReadFailed"))?
        .into_bytes();
    if bytes.as_ref() != expected {
        return Err(Failure::failed("getContentMismatch"));
    }
    Ok(())
}

async fn conditional_put(resources: &mut ProbeResources) -> Result<&'static str, Failure> {
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
            Ok("conditionalPutProtected")
        }
        Err(error) => Err(conditional_failure(&error)),
        Ok(_) => Err(Failure::failed("conditionalPutUnsafe")),
    }
}

async fn pagination(resources: &mut ProbeResources) -> Result<&'static str, Failure> {
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
        .ok_or_else(|| Failure::failed("missingContinuationToken"))?;
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
        return Err(Failure::failed("paginationMissingObjects"));
    }
    Ok("paginationPassed")
}

async fn copy_delete(
    resources: &mut ProbeResources,
    source: &str,
) -> Result<&'static str, Failure> {
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
        return Err(Failure::failed("deleteStillVisible"));
    }
    Ok("copyDeletePassed")
}

async fn multipart_upload(resources: &mut ProbeResources) -> Result<&'static str, Failure> {
    let path = std::env::temp_dir().join(format!(
        "cloudstore-compat-{}-{}.bin",
        std::process::id(),
        NEXT_PROBE_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| Failure::failed("localTempFileFailed").detail(error.to_string()))?;
    let _local_file = LocalProbeFile(path.clone());
    let result = file
        .set_len(LARGE_SIZE)
        .map_err(|error| Failure::failed("localTempFileFailed").detail(error.to_string()));
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
        Ok(_) => {
            return Err(Failure::failed("multipartMissingObject"));
        }
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
        return Err(Failure::failed("multipartSizeMismatch"));
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
        .map_err(|_| Failure::failed("multipartRangeReadFailed"))?
        .into_bytes();
    if body.len() != 32 || body.iter().any(|byte| *byte != 0) {
        return Err(Failure::failed("multipartContentMismatch"));
    }
    Ok("multipartUploadPassed")
}

async fn multipart_abort(resources: &mut ProbeResources) -> Result<&'static str, Failure> {
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
        .ok_or_else(|| Failure::failed("missingUploadId"))?
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
    Ok("multipartAbortPassed")
}

async fn conditional_complete(resources: &mut ProbeResources) -> Result<&'static str, Failure> {
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
        .ok_or_else(|| Failure::failed("missingUploadId"))?
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
        .ok_or_else(|| Failure::failed("missingPartEtag"))?;
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
            Ok("conditionalCompleteProtected")
        }
        Err(error) => Err(conditional_failure(&error)),
        Ok(_) => Err(Failure::failed("conditionalCompleteUnsafe")),
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
            Ok(page) if page.contents().is_empty() => Ok("isolatedPrefixPassed"),
            Ok(_) => Err(Failure::failed("isolatedPrefixOccupied")),
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
            Ok("basicReadWritePassed")
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
            skipped(&mut checks, "pagination", "basicReadWriteRequired");
            skipped(&mut checks, "copyDelete", "basicReadWriteRequired");
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
            skipped(&mut checks, id, "isolatedPrefixRequired");
        }
        if matches!(mode, ProbeMode::Full) {
            for id in ["multipartUpload", "multipartAbort", "conditionalComplete"] {
                skipped(&mut checks, id, "isolatedPrefixRequired");
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
    use super::{ProbeCheck, ProbeDiagnostic, probe_prefix};

    #[test]
    fn probe_prefix_is_unique_and_isolated() {
        let first = probe_prefix();
        let second = probe_prefix();
        assert!(first.starts_with("__cloudstore-compat/"));
        assert!(first.ends_with('/'));
        assert_ne!(first, second);
    }

    #[test]
    fn probe_diagnostic_serializes_code_params_and_raw_detail() {
        let check = ProbeCheck {
            id: "list",
            status: "failed",
            diagnostic: ProbeDiagnostic::new("cleanupDeleteFailed")
                .param("key", "test-object")
                .detail("HTTP 403"),
        };
        let value = serde_json::to_value(check).unwrap();
        assert_eq!(value["diagnostic"]["code"], "cleanupDeleteFailed");
        assert_eq!(value["diagnostic"]["params"]["key"], "test-object");
        assert_eq!(value["diagnostic"]["detail"], "HTTP 403");
    }
}
