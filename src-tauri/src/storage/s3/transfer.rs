use super::format_storage_error;
use super::multipart::{MULTIPART_THRESHOLD, MultipartCleanup, multipart_part_size};
use super::objects::DownloadObjectsResult;
use crate::error::{AppError, ErrorCode};
use crate::transfers::model::UploadConflictAction;
use aws_sdk_s3::error::ProvideErrorMetadata;
use aws_sdk_s3::{
    primitives::ByteStream,
    types::{CompletedMultipartUpload, CompletedPart},
};
use std::collections::BTreeMap;

const PAGE_SIZE: i32 = 100;
use aws_sdk_s3::Client;
use bytes::Bytes;
use http_body::{Body, Frame, SizeHint};
use std::{
    fs,
    path::{Path, PathBuf},
    pin::Pin,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    task::{Context, Poll},
};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncWriteExt},
};

static NEXT_TEMP_FILE_ID: AtomicU64 = AtomicU64::new(1);

pub(crate) enum UploadOutcome {
    Uploaded(String),
    Skipped,
}

enum UploadAttemptError {
    Conflict,
    Failed(AppError),
}

fn upload_copy_key(key: &str, number: usize) -> String {
    let (directory, name) = key.rsplit_once('/').unwrap_or(("", key));
    let renamed = match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => {
            format!("{stem} ({number}).{extension}")
        }
        _ => format!("{name} ({number})"),
    };
    if directory.is_empty() {
        renamed
    } else {
        format!("{directory}/{renamed}")
    }
}

fn upload_copy_folder_key(key: &str, number: usize) -> String {
    let key = key.trim_end_matches('/');
    let (directory, name) = key.rsplit_once('/').unwrap_or(("", key));
    if directory.is_empty() {
        format!("{name} ({number})/")
    } else {
        format!("{directory}/{name} ({number})/")
    }
}

async fn upload_target_exists(client: &Client, bucket: &str, key: &str) -> Result<bool, AppError> {
    match client.head_object().bucket(bucket).key(key).send().await {
        Ok(_) => Ok(true),
        Err(error)
            if error
                .as_service_error()
                .is_some_and(|service| service.is_not_found())
                || error
                    .raw_response()
                    .is_some_and(|response| response.status().as_u16() == 404) =>
        {
            Ok(false)
        }
        Err(error) => Err(AppError::with_detail(
            ErrorCode::StorageRequestFailed,
            format_storage_error(&error),
        )),
    }
}

pub(crate) async fn upload_file(
    client: &Client,
    bucket: &str,
    prefix: &str,
    path: &Path,
    conflict_action: UploadConflictAction,
    on_progress: ProgressCallback,
) -> Result<UploadOutcome, AppError> {
    let metadata = fs::metadata(path).map_err(|error| {
        AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
    })?;
    if !metadata.is_file() {
        return Err(AppError::new(ErrorCode::TransferInvalidSource));
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| AppError::new(ErrorCode::TransferInvalidSource))?;
    let prefix = prefix.trim_matches('/');
    let key = if prefix.is_empty() {
        file_name.to_string()
    } else {
        format!("{prefix}/{file_name}")
    };
    for number in 0..=1000 {
        let target_key = if number == 0 {
            key.clone()
        } else if conflict_action == UploadConflictAction::KeepBoth {
            upload_copy_key(&key, number)
        } else {
            break;
        };
        if conflict_action != UploadConflictAction::Overwrite
            && upload_target_exists(client, bucket, &target_key).await?
        {
            if conflict_action == UploadConflictAction::Skip {
                return Ok(UploadOutcome::Skipped);
            }
            continue;
        }

        let result = if metadata.len() < MULTIPART_THRESHOLD {
            upload_single(
                client,
                bucket,
                &target_key,
                path,
                metadata.len(),
                conflict_action,
                on_progress.clone(),
            )
            .await
        } else {
            upload_multipart(
                client,
                bucket,
                &target_key,
                path,
                metadata.len(),
                conflict_action,
                &on_progress,
            )
            .await
        };
        match result {
            Ok(()) => return Ok(UploadOutcome::Uploaded(target_key)),
            Err(UploadAttemptError::Conflict) => {
                if conflict_action == UploadConflictAction::Skip {
                    return Ok(UploadOutcome::Skipped);
                }
            }
            Err(UploadAttemptError::Failed(error)) => return Err(error),
        }
    }
    Err(AppError::new(ErrorCode::TransferConflict))
}

pub(crate) async fn upload_folder_marker(
    client: &Client,
    bucket: &str,
    key: &str,
    path: &Path,
    conflict_action: UploadConflictAction,
) -> Result<UploadOutcome, AppError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
    })?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(AppError::new(ErrorCode::TransferInvalidSource));
    }
    for number in 0..=1000 {
        let target_key = if number == 0 {
            key.to_string()
        } else if conflict_action == UploadConflictAction::KeepBoth {
            upload_copy_folder_key(key, number)
        } else {
            break;
        };
        if conflict_action != UploadConflictAction::Overwrite
            && upload_target_exists(client, bucket, &target_key).await?
        {
            if conflict_action == UploadConflictAction::Skip {
                return Ok(UploadOutcome::Skipped);
            }
            continue;
        }
        let mut request = client
            .put_object()
            .bucket(bucket)
            .key(&target_key)
            .body(ByteStream::from_static(b""));
        if conflict_action != UploadConflictAction::Overwrite {
            request = request.if_none_match("*");
        }
        match request.send().await {
            Ok(_) => return Ok(UploadOutcome::Uploaded(target_key)),
            Err(error)
                if conflict_action != UploadConflictAction::Overwrite
                    && (error
                        .as_service_error()
                        .and_then(ProvideErrorMetadata::code)
                        .is_some_and(|code| code == "PreconditionFailed")
                        || error
                            .raw_response()
                            .is_some_and(|response| response.status().as_u16() == 412)) =>
            {
                if conflict_action == UploadConflictAction::Skip {
                    return Ok(UploadOutcome::Skipped);
                }
            }
            Err(error) => {
                return Err(AppError::with_detail(
                    ErrorCode::StorageRequestFailed,
                    format_storage_error(&error),
                ));
            }
        }
    }
    Err(AppError::new(ErrorCode::TransferConflict))
}

async fn upload_single(
    client: &Client,
    bucket: &str,
    key: &str,
    path: &Path,
    size: u64,
    conflict_action: UploadConflictAction,
    on_progress: ProgressCallback,
) -> Result<(), UploadAttemptError> {
    let body = progress_body_from_path(path, size, on_progress)
        .await
        .map_err(UploadAttemptError::Failed)?;
    let mut request = client
        .put_object()
        .bucket(bucket)
        .key(key)
        .content_length(size as i64)
        .body(body);
    if conflict_action != UploadConflictAction::Overwrite {
        request = request.if_none_match("*");
    }
    match request.send().await {
        Ok(_) => Ok(()),
        Err(error)
            if conflict_action != UploadConflictAction::Overwrite
                && (error
                    .as_service_error()
                    .and_then(ProvideErrorMetadata::code)
                    .is_some_and(|code| code == "PreconditionFailed")
                    || error
                        .raw_response()
                        .is_some_and(|response| response.status().as_u16() == 412)) =>
        {
            Err(UploadAttemptError::Conflict)
        }
        Err(error) => Err(UploadAttemptError::Failed(AppError::with_detail(
            ErrorCode::StorageRequestFailed,
            format_storage_error(&error),
        ))),
    }
}

#[allow(clippy::too_many_arguments)]
async fn upload_multipart(
    client: &Client,
    bucket: &str,
    key: &str,
    path: &Path,
    size: u64,
    conflict_action: UploadConflictAction,
    on_progress: &ProgressCallback,
) -> Result<(), UploadAttemptError> {
    let part_size = multipart_part_size(size).map_err(UploadAttemptError::Failed)?;
    on_progress(0, Some(size));
    let started = client
        .create_multipart_upload()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| {
            UploadAttemptError::Failed(AppError::with_detail(
                ErrorCode::StorageRequestFailed,
                format_storage_error(&error),
            ))
        })?;
    let upload_id = started
        .upload_id()
        .ok_or_else(|| {
            UploadAttemptError::Failed(AppError::new(ErrorCode::TransferMultipartFailed))
        })?
        .to_string();
    let mut cleanup = MultipartCleanup::new(client, bucket, key, upload_id.clone());
    let mut file = File::open(path).await.map_err(|error| {
        UploadAttemptError::Failed(AppError::with_detail(
            ErrorCode::TransferLocalReadFailed,
            error.to_string(),
        ))
    })?;
    let mut parts = Vec::new();
    let mut transferred = 0u64;
    let mut part_number = 1;
    while transferred < size {
        let part_len = (size - transferred).min(part_size) as usize;
        let mut chunk = vec![0u8; part_len];
        file.read_exact(&mut chunk).await.map_err(|error| {
            UploadAttemptError::Failed(
                AppError::with_detail(ErrorCode::TransferMultipartFailed, error.to_string())
                    .param("part", part_number),
            )
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
                UploadAttemptError::Failed(
                    AppError::with_detail(
                        ErrorCode::TransferMultipartFailed,
                        format_storage_error(&error),
                    )
                    .param("part", part_number),
                )
            })?;
        let etag = uploaded.e_tag().ok_or_else(|| {
            UploadAttemptError::Failed(
                AppError::new(ErrorCode::StorageResponseInvalid).param("part", part_number),
            )
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
    if file
        .metadata()
        .await
        .map_err(|error| {
            UploadAttemptError::Failed(AppError::with_detail(
                ErrorCode::StorageRequestFailed,
                error.to_string(),
            ))
        })?
        .len()
        != size
    {
        return Err(UploadAttemptError::Failed(AppError::new(
            ErrorCode::TransferSourceChanged,
        )));
    }
    let mut complete = client
        .complete_multipart_upload()
        .bucket(bucket)
        .key(key)
        .upload_id(&upload_id)
        .multipart_upload(
            CompletedMultipartUpload::builder()
                .set_parts(Some(parts))
                .build(),
        );
    if conflict_action != UploadConflictAction::Overwrite {
        complete = complete.if_none_match("*");
    }
    match complete.send().await {
        Ok(_) => {
            cleanup.disarm();
            Ok(())
        }
        Err(error)
            if conflict_action != UploadConflictAction::Overwrite
                && (error
                    .as_service_error()
                    .and_then(ProvideErrorMetadata::code)
                    .is_some_and(|code| code == "PreconditionFailed")
                    || error
                        .raw_response()
                        .is_some_and(|response| response.status().as_u16() == 412)) =>
        {
            Err(UploadAttemptError::Conflict)
        }
        Err(error) => Err(UploadAttemptError::Failed(AppError::with_detail(
            ErrorCode::TransferMultipartFailed,
            format_storage_error(&error),
        ))),
    }
}

pub(crate) async fn download_file(
    client: &Client,
    bucket: &str,
    key: &str,
    relative_path: &str,
    destination_root: &Path,
    overwrite: bool,
    on_progress: ProgressCallback,
) -> Result<bool, AppError> {
    let destination = safe_download_path(destination_root, relative_path)?;
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::new(ErrorCode::TransferInvalidDestination))?;
    fs::create_dir_all(parent).map_err(|error| {
        AppError::with_detail(ErrorCode::TransferLocalWriteFailed, error.to_string())
    })?;
    let canonical_parent = parent.canonicalize().map_err(|error| {
        AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
    })?;
    if !canonical_parent.starts_with(destination_root)
        || fs::symlink_metadata(&destination)
            .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err(AppError::new(ErrorCode::TransferUnsafePath));
    }
    if destination.exists() && !overwrite {
        return Ok(false);
    }
    let output = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(
                ErrorCode::StorageRequestFailed,
                format_storage_error(&error),
            )
        })?;
    let total = u64::try_from(output.content_length().unwrap_or(-1)).ok();
    on_progress(0, total);
    let temp_path = parent.join(format!(
        ".cloudstore-{}-{}.part",
        std::process::id(),
        NEXT_TEMP_FILE_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let mut cleanup = TempDownload::new(temp_path.clone());
    let mut file = File::create(&temp_path).await.map_err(|error| {
        AppError::with_detail(ErrorCode::TransferLocalWriteFailed, error.to_string())
    })?;
    let mut body = output.body.into_async_read();
    let mut buffer = [0u8; 64 * 1024];
    let mut transferred = 0u64;
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
        transferred += count as u64;
        on_progress(transferred, total);
    }
    if total.is_some_and(|expected| transferred != expected) {
        return Err(AppError::new(ErrorCode::TransferVerificationFailed));
    }
    file.flush().await.map_err(|error| {
        AppError::with_detail(ErrorCode::TransferLocalWriteFailed, error.to_string())
    })?;
    drop(file);
    if overwrite && destination.exists() {
        fs::remove_file(&destination).map_err(|error| {
            AppError::with_detail(ErrorCode::TransferLocalWriteFailed, error.to_string())
        })?;
    }
    fs::rename(&temp_path, &destination).map_err(|error| {
        AppError::with_detail(ErrorCode::TransferLocalWriteFailed, error.to_string())
    })?;
    cleanup.disarm();
    Ok(true)
}

pub(crate) type ProgressCallback = Arc<dyn Fn(u64, Option<u64>) + Send + Sync>;

pub(crate) async fn progress_body_from_path(
    path: &Path,
    total: u64,
    on_progress: ProgressCallback,
) -> Result<aws_sdk_s3::primitives::ByteStream, AppError> {
    Ok(aws_sdk_s3::primitives::ByteStream::from_path(path)
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
        })?
        .map(move |inner| {
            on_progress(0, Some(total));
            aws_sdk_s3::primitives::SdkBody::from_body_1_x(ProgressBody {
                inner,
                transferred: 0,
                total,
                on_progress: on_progress.clone(),
            })
        }))
}

struct ProgressBody {
    inner: aws_sdk_s3::primitives::SdkBody,
    transferred: u64,
    total: u64,
    on_progress: ProgressCallback,
}

impl Body for ProgressBody {
    type Data = Bytes;
    type Error = aws_sdk_s3::error::BoxError;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        match Pin::new(&mut self.inner).poll_frame(cx) {
            Poll::Ready(Some(Ok(frame))) => {
                if let Some(data) = frame.data_ref() {
                    self.transferred += data.len() as u64;
                    (self.on_progress)(self.transferred, Some(self.total));
                }
                Poll::Ready(Some(Ok(frame)))
            }
            other => other,
        }
    }

    fn is_end_stream(&self) -> bool {
        self.inner.is_end_stream()
    }

    fn size_hint(&self) -> SizeHint {
        Body::size_hint(&self.inner)
    }
}

struct TempDownload {
    path: PathBuf,
    armed: bool,
}

impl TempDownload {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempDownload {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

pub(crate) fn safe_download_path(root: &Path, relative_key: &str) -> Result<PathBuf, AppError> {
    let relative_key = relative_key.trim_end_matches('/');
    if relative_key.is_empty() {
        return Err(AppError::new(ErrorCode::ObjectsInvalidKey));
    }

    let mut destination = root.to_path_buf();
    for component in relative_key.split('/') {
        if component.is_empty()
            || component == "."
            || component == ".."
            || component
                .chars()
                .any(|character| matches!(character, '\\' | ':' | '\0'))
        {
            return Err(AppError::new(ErrorCode::TransferUnsafePath));
        }
        destination.push(component);
    }
    if !destination.starts_with(root) {
        return Err(AppError::new(ErrorCode::TransferUnsafePath));
    }
    Ok(destination)
}

pub(crate) async fn download_objects(
    client: &Client,
    bucket: &str,
    prefix: String,
    keys: Vec<String>,
    destination_path: String,
) -> Result<DownloadObjectsResult, AppError> {
    if keys.is_empty() {
        return Err(AppError::new(ErrorCode::TransferInvalidDestination));
    }

    let destination_root = PathBuf::from(destination_path)
        .canonicalize()
        .map_err(|error| {
            AppError::with_detail(ErrorCode::StorageRequestFailed, error.to_string())
        })?;
    if !destination_root.is_dir() {
        return Err(AppError::new(ErrorCode::TransferInvalidDestination));
    }

    let normalized_prefix = if prefix.trim_matches('/').is_empty() {
        String::new()
    } else {
        format!("{}/", prefix.trim_matches('/'))
    };
    let mut files = BTreeMap::<String, String>::new();
    let mut failed_keys = Vec::new();

    for key in keys {
        if !key.starts_with(&normalized_prefix) {
            return Err(AppError::new(ErrorCode::TransferInvalidDestination));
        }

        if key.ends_with('/') {
            let relative_directory = key
                .strip_prefix(&normalized_prefix)
                .ok_or_else(|| AppError::new(ErrorCode::TransferInvalidDestination))?;
            match safe_download_path(&destination_root, relative_directory) {
                Ok(path) => {
                    if fs::create_dir_all(&path).is_err() {
                        failed_keys.push(key.clone());
                        continue;
                    }
                    match path.canonicalize() {
                        Ok(canonical_path) if canonical_path.starts_with(&destination_root) => {}
                        _ => {
                            failed_keys.push(key.clone());
                            continue;
                        }
                    }
                }
                Err(_) => {
                    failed_keys.push(key.clone());
                    continue;
                }
            }

            let mut continuation_token = None;
            loop {
                let mut request = client
                    .list_objects_v2()
                    .bucket(bucket)
                    .prefix(&key)
                    .max_keys(PAGE_SIZE);
                if let Some(token) = continuation_token.as_deref() {
                    request = request.continuation_token(token);
                }
                let page = request.send().await.map_err(|error| {
                    AppError::with_detail(
                        ErrorCode::StorageRequestFailed,
                        format_storage_error(&error),
                    )
                })?;
                for object in page.contents() {
                    let Some(object_key) = object.key() else {
                        continue;
                    };
                    if object_key.ends_with('/') {
                        continue;
                    }
                    let Some(relative_key) = object_key.strip_prefix(&normalized_prefix) else {
                        failed_keys.push(object_key.to_string());
                        continue;
                    };
                    files.insert(relative_key.to_string(), object_key.to_string());
                }
                continuation_token = page.next_continuation_token().map(ToOwned::to_owned);
                if continuation_token.is_none() {
                    break;
                }
            }
        } else {
            let Some(relative_key) = key.strip_prefix(&normalized_prefix) else {
                return Err(AppError::new(ErrorCode::TransferInvalidDestination));
            };
            files.insert(relative_key.to_string(), key);
        }
    }

    let mut result = DownloadObjectsResult {
        downloaded_count: 0,
        failed_keys,
    };
    for (relative_key, object_key) in files {
        let destination = match safe_download_path(&destination_root, &relative_key) {
            Ok(path) => path,
            Err(_) => {
                result.failed_keys.push(object_key);
                continue;
            }
        };
        let Some(parent) = destination.parent() else {
            result.failed_keys.push(object_key);
            continue;
        };
        if fs::create_dir_all(parent).is_err() {
            result.failed_keys.push(object_key);
            continue;
        }
        let Ok(canonical_parent) = parent.canonicalize() else {
            result.failed_keys.push(object_key);
            continue;
        };
        if !canonical_parent.starts_with(&destination_root)
            || fs::symlink_metadata(&destination)
                .is_ok_and(|metadata| metadata.file_type().is_symlink())
        {
            result.failed_keys.push(object_key);
            continue;
        }

        let output = match client
            .get_object()
            .bucket(bucket)
            .key(&object_key)
            .send()
            .await
        {
            Ok(output) => output,
            Err(_) => {
                result.failed_keys.push(object_key);
                continue;
            }
        };
        let mut file = match File::create(&destination).await {
            Ok(file) => file,
            Err(_) => {
                result.failed_keys.push(object_key);
                continue;
            }
        };
        let mut body = output.body.into_async_read();
        if tokio::io::copy(&mut body, &mut file).await.is_err() || file.flush().await.is_err() {
            drop(file);
            let _ = fs::remove_file(&destination);
            result.failed_keys.push(object_key);
            continue;
        }
        result.downloaded_count += 1;
    }

    Ok(result)
}

#[cfg(test)]
mod upload_conflict_tests {
    use super::{upload_copy_folder_key, upload_copy_key};

    #[test]
    fn copy_names_preserve_directory_and_extension() {
        assert_eq!(
            upload_copy_key("photos/summer.jpg", 2),
            "photos/summer (2).jpg"
        );
        assert_eq!(upload_copy_key("archive.tar.gz", 1), "archive.tar (1).gz");
        assert_eq!(upload_copy_key(".env", 1), ".env (1)");
        assert_eq!(
            upload_copy_folder_key("photos/empty/", 2),
            "photos/empty (2)/"
        );
    }
}
