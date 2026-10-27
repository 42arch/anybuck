use crate::error::{AppError, ErrorCode};
use aws_sdk_s3::{
    Client,
    operation::head_object::HeadObjectOutput,
    primitives::{DateTime, DateTimeFormat},
    types::{CompletedMultipartUpload, CompletedPart},
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const PAGE_SIZE: i32 = 1000;
const SINGLE_COPY_LIMIT: i64 = 5 * 1024 * 1024 * 1024;
const COPY_PART_SIZE: i64 = 1024 * 1024 * 1024;

pub(crate) struct PlannedObjectRoot {
    pub source_root: String,
    pub destination_root: String,
    pub objects: Vec<(String, String)>,
    pub error: Option<AppError>,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CopyCheckpoint {
    pub source_etag: String,
    pub target_etag: String,
    pub size: u64,
}

pub(crate) async fn plan_object_operations(
    source_client: &Client,
    source_bucket: &str,
    target_client: &Client,
    target_bucket: &str,
    same_storage: bool,
    keys: Vec<String>,
    destination_prefix: String,
) -> Result<Vec<PlannedObjectRoot>, AppError> {
    let destination_prefix = destination_prefix.trim_matches('/');
    if destination_prefix
        .split('/')
        .any(|part| part == "." || part == ".." || part.is_empty())
        && !destination_prefix.is_empty()
    {
        return Err(AppError::new(ErrorCode::TransferInvalidDestination));
    }

    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    let mut destinations = HashSet::new();
    for source_root in keys.into_iter().filter(|key| seen.insert(key.clone())) {
        let mut root = PlannedObjectRoot {
            source_root: source_root.clone(),
            destination_root: String::new(),
            objects: Vec::new(),
            error: None,
        };
        if source_root.is_empty() {
            root.error = Some(AppError::new(ErrorCode::ObjectsInvalidKey));
            roots.push(root);
            continue;
        }
        let is_folder = source_root.ends_with('/');
        let name = source_root
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("");
        if name.is_empty() {
            root.error = Some(AppError::new(ErrorCode::ObjectsInvalidKey));
            roots.push(root);
            continue;
        }
        let destination_root = if destination_prefix.is_empty() {
            format!("{name}{}", if is_folder { "/" } else { "" })
        } else {
            format!(
                "{destination_prefix}/{name}{}",
                if is_folder { "/" } else { "" }
            )
        };
        root.destination_root = destination_root.clone();
        if same_storage
            && (source_root == destination_root
                || (is_folder && destination_root.starts_with(&source_root)))
        {
            root.error = Some(AppError::new(ErrorCode::TransferInvalidDestination));
            roots.push(root);
            continue;
        }
        if !destinations.insert(destination_root.clone()) {
            root.error = Some(AppError::new(ErrorCode::TransferConflict));
            roots.push(root);
            continue;
        }

        let source_keys = if is_folder {
            match list_all_keys(source_client, source_bucket, &source_root).await {
                Ok(keys) if !keys.is_empty() => keys,
                Ok(_) => {
                    root.error = Some(AppError::new(ErrorCode::TransferInvalidSource));
                    roots.push(root);
                    continue;
                }
                Err(reason) => {
                    root.error = Some(reason);
                    roots.push(root);
                    continue;
                }
            }
        } else {
            vec![source_root.clone()]
        };

        match target_exists(target_client, target_bucket, &destination_root, is_folder).await {
            Ok(true) => {
                root.error = Some(AppError::new(ErrorCode::TransferConflict));
                roots.push(root);
                continue;
            }
            Err(reason) => {
                root.error = Some(reason);
                roots.push(root);
                continue;
            }
            Ok(false) => {}
        }

        for source_key in source_keys {
            let target_key = if is_folder {
                let suffix = source_key.strip_prefix(&source_root).unwrap_or("");
                format!("{destination_root}{suffix}")
            } else {
                destination_root.clone()
            };
            root.objects.push((source_key, target_key));
        }
        roots.push(root);
    }
    Ok(roots)
}

async fn list_all_keys(
    client: &Client,
    bucket: &str,
    prefix: &str,
) -> Result<Vec<String>, AppError> {
    let mut keys = Vec::new();
    let mut continuation_token = None;
    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(bucket)
            .prefix(prefix)
            .max_keys(PAGE_SIZE);
        if let Some(token) = continuation_token.as_deref() {
            request = request.continuation_token(token);
        }
        let page = request.send().await.map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
        keys.extend(
            page.contents()
                .iter()
                .filter_map(|object| object.key().map(ToOwned::to_owned)),
        );
        continuation_token = page.next_continuation_token().map(ToOwned::to_owned);
        if continuation_token.is_none() {
            break;
        }
    }
    Ok(keys)
}

pub(crate) async fn target_exists(
    client: &Client,
    bucket: &str,
    key: &str,
    is_folder: bool,
) -> Result<bool, AppError> {
    let page = client
        .list_objects_v2()
        .bucket(bucket)
        .prefix(key)
        .max_keys(1)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    if is_folder {
        if !page.contents().is_empty() {
            return Ok(true);
        }
        return object_exists(client, bucket, key.trim_end_matches('/')).await;
    }
    if page.contents().first().and_then(|object| object.key()) == Some(key) {
        return Ok(true);
    }
    let folder_prefix = format!("{key}/");
    let folder = client
        .list_objects_v2()
        .bucket(bucket)
        .prefix(folder_prefix)
        .max_keys(1)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    Ok(!folder.contents().is_empty())
}

async fn object_exists(client: &Client, bucket: &str, key: &str) -> Result<bool, AppError> {
    let page = client
        .list_objects_v2()
        .bucket(bucket)
        .prefix(key)
        .max_keys(1)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    Ok(page.contents().first().and_then(|object| object.key()) == Some(key))
}

pub(crate) async fn copy_only(
    client: &Client,
    bucket: &str,
    source: &str,
    target: &str,
    on_progress: Option<&(dyn Fn(u64, Option<u64>) + Send + Sync)>,
) -> Result<CopyCheckpoint, AppError> {
    let source_head = client
        .head_object()
        .bucket(bucket)
        .key(source)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    let size = source_head
        .content_length()
        .ok_or_else(|| AppError::new(ErrorCode::StorageResponseInvalid))?;
    let size = u64::try_from(size).map_err(|_| AppError::new(ErrorCode::StorageResponseInvalid))?;
    if let Some(progress) = on_progress {
        progress(0, Some(size));
    }
    let source_etag = source_head
        .e_tag()
        .ok_or_else(|| AppError::new(ErrorCode::StorageResponseInvalid))?
        .to_string();
    let copy_source = format!(
        "{}/{}",
        encode_copy_source(bucket),
        encode_copy_source(source)
    );

    if size <= SINGLE_COPY_LIMIT as u64 {
        let mut request = client
            .copy_object()
            .bucket(bucket)
            .key(target)
            .copy_source(copy_source);
        request = request.copy_source_if_match(&source_etag);
        request
            .customize()
            .mutate_request(|request| {
                if request
                    .uri()
                    .strip_prefix("https://")
                    .and_then(|rest| rest.split('/').next())
                    .is_some_and(|host| host.ends_with(".r2.cloudflarestorage.com"))
                {
                    request
                        .headers_mut()
                        .insert("cf-copy-destination-if-none-match", "*");
                }
            })
            .send()
            .await
            .map_err(|error| {
                AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
            })?;
        if let Some(progress) = on_progress {
            progress(size, Some(size));
        }
    } else {
        copy_multipart(
            client,
            bucket,
            target,
            &copy_source,
            size as i64,
            &source_head,
            on_progress,
        )
        .await?;
    }

    let current = client
        .head_object()
        .bucket(bucket)
        .key(source)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    if current.content_length() != Some(size as i64)
        || current.e_tag() != Some(source_etag.as_str())
    {
        return Err(AppError::new(ErrorCode::TransferSourceChanged));
    }
    let target_head = client
        .head_object()
        .bucket(bucket)
        .key(target)
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
        .ok_or_else(|| AppError::new(ErrorCode::StorageResponseInvalid))?;
    Ok(CopyCheckpoint {
        source_etag,
        target_etag: target_etag.to_string(),
        size,
    })
}

pub(crate) async fn finish_move(
    source_client: &Client,
    source_bucket: &str,
    target_client: &Client,
    target_bucket: &str,
    source: &str,
    target: &str,
    checkpoint: &CopyCheckpoint,
) -> Result<(), AppError> {
    let target_head = target_client
        .head_object()
        .bucket(target_bucket)
        .key(target)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    if target_head.content_length() != Some(checkpoint.size as i64)
        || target_head.e_tag() != Some(checkpoint.target_etag.as_str())
    {
        return Err(AppError::new(ErrorCode::TransferDestinationChanged));
    }
    let source_head = match source_client
        .head_object()
        .bucket(source_bucket)
        .key(source)
        .send()
        .await
    {
        Ok(head) => head,
        Err(error)
            if error
                .as_service_error()
                .is_some_and(|service| service.is_not_found()) =>
        {
            return Ok(());
        }
        Err(error) => {
            return Err(AppError::with_detail(
                ErrorCode::StorageRequestFailed,
                error.to_string(),
            ));
        }
    };
    if source_head.content_length() != Some(checkpoint.size as i64)
        || source_head.e_tag() != Some(checkpoint.source_etag.as_str())
    {
        return Err(AppError::new(ErrorCode::TransferSourceChanged));
    }
    source_client
        .delete_object()
        .bucket(source_bucket)
        .key(source)
        .if_match(&checkpoint.source_etag)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    Ok(())
}

async fn copy_multipart(
    client: &Client,
    bucket: &str,
    target: &str,
    copy_source: &str,
    size: i64,
    source_head: &HeadObjectOutput,
    on_progress: Option<&(dyn Fn(u64, Option<u64>) + Send + Sync)>,
) -> Result<(), AppError> {
    let mut create = client.create_multipart_upload().bucket(bucket).key(target);
    if let Some(content_type) = source_head.content_type() {
        create = create.content_type(content_type);
    }
    if let Some(value) = source_head.cache_control() {
        create = create.cache_control(value);
    }
    if let Some(value) = source_head.content_disposition() {
        create = create.content_disposition(value);
    }
    if let Some(value) = source_head.content_encoding() {
        create = create.content_encoding(value);
    }
    if let Some(value) = source_head.content_language() {
        create = create.content_language(value);
    }
    if let Some(value) = source_head.expires_string() {
        let expires = DateTime::from_str(value, DateTimeFormat::HttpDate).map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
        create = create.expires(expires);
    }
    if let Some(metadata) = source_head.metadata() {
        create = create.set_metadata(Some(metadata.clone()));
    }
    if let Some(storage_class) = source_head.storage_class() {
        create = create.storage_class(storage_class.clone());
    }
    let started = create.send().await.map_err(|error| {
        AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
    })?;
    let upload_id = started
        .upload_id()
        .ok_or_else(|| AppError::new(ErrorCode::TransferMultipartFailed))?;
    let mut cleanup = MultipartCopyCleanup {
        client: client.clone(),
        bucket: bucket.to_string(),
        target: target.to_string(),
        upload_id: Some(upload_id.to_string()),
    };
    let operation = async {
        let mut parts = Vec::new();
        let mut offset = 0;
        let mut part_number = 1;
        while offset < size {
            let end = (offset + COPY_PART_SIZE).min(size) - 1;
            let copied = client
                .upload_part_copy()
                .bucket(bucket)
                .key(target)
                .upload_id(upload_id)
                .part_number(part_number)
                .copy_source(copy_source)
                .copy_source_range(format!("bytes={offset}-{end}"))
                .send()
                .await
                .map_err(|error| {
                    AppError::with_detail(ErrorCode::TransferMultipartFailed, error.to_string())
                        .param("part", part_number)
                })?;
            let etag = copied
                .copy_part_result()
                .and_then(|part| part.e_tag())
                .ok_or_else(|| {
                    AppError::new(ErrorCode::StorageResponseInvalid).param("part", part_number)
                })?;
            parts.push(
                CompletedPart::builder()
                    .part_number(part_number)
                    .e_tag(etag)
                    .build(),
            );
            part_number += 1;
            offset = end + 1;
            if let Some(progress) = on_progress {
                progress(offset as u64, Some(size as u64));
            }
        }
        client
            .complete_multipart_upload()
            .bucket(bucket)
            .key(target)
            .upload_id(upload_id)
            .multipart_upload(
                CompletedMultipartUpload::builder()
                    .set_parts(Some(parts))
                    .build(),
            )
            .if_none_match("*")
            .send()
            .await
            .map_err(|error| {
                AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
            })?;
        Ok::<(), AppError>(())
    }
    .await;
    let cleaned = if operation.is_err() {
        client
            .abort_multipart_upload()
            .bucket(bucket)
            .key(target)
            .upload_id(upload_id)
            .send()
            .await
            .is_ok()
    } else {
        true
    };
    if cleaned {
        cleanup.upload_id = None;
    }
    operation
}

struct MultipartCopyCleanup {
    client: Client,
    bucket: String,
    target: String,
    upload_id: Option<String>,
}

impl Drop for MultipartCopyCleanup {
    fn drop(&mut self) {
        let Some(upload_id) = self.upload_id.take() else {
            return;
        };
        let client = self.client.clone();
        let bucket = self.bucket.clone();
        let target = self.target.clone();
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                let _ = client
                    .abort_multipart_upload()
                    .bucket(bucket)
                    .key(target)
                    .upload_id(upload_id)
                    .send()
                    .await;
            });
        }
    }
}

fn encode_copy_source(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'/') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}
