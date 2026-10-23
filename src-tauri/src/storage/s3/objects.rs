use super::format_storage_error;
use aws_sdk_s3::{
    Client,
    types::{Delete, ObjectIdentifier},
};
use serde::Serialize;
use std::collections::HashSet;
use tokio::io::AsyncReadExt;
const PAGE_SIZE: i32 = 100;
const COUNT_PAGE_SIZE: i32 = 1000;
const DELETE_BATCH_SIZE: usize = 1000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageObjectPage {
    pub(crate) objects: Vec<StorageObject>,
    pub(crate) next_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteObjectsResult {
    pub(crate) deleted_count: usize,
    pub(crate) failed_keys: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadObjectsResult {
    pub(crate) downloaded_count: usize,
    pub(crate) failed_keys: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageObject {
    pub(crate) key: String,
    pub(crate) name: String,
    pub(crate) kind: &'static str,
    pub(crate) size: Option<i64>,
    pub(crate) last_modified: Option<String>,
    pub(crate) etag: Option<String>,
}

pub(crate) async fn fetch_page(
    client: &Client,
    bucket: &str,
    prefix: &str,
    continuation_token: Option<&str>,
) -> Result<StorageObjectPage, String> {
    let normalized_prefix = if prefix.is_empty() {
        String::new()
    } else {
        format!("{}/", prefix.trim_matches('/'))
    };
    let mut request = client
        .list_objects_v2()
        .bucket(bucket)
        .prefix(&normalized_prefix)
        .delimiter("/")
        .max_keys(PAGE_SIZE);
    if let Some(token) = continuation_token {
        request = request.continuation_token(token);
    }

    let output = request
        .send()
        .await
        .map_err(|error| format_storage_error(&error))?;
    let mut objects = Vec::new();

    for common_prefix in output.common_prefixes() {
        if let Some(key) = common_prefix.prefix() {
            let name = key
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .unwrap_or_default()
                .to_string();
            if !name.is_empty() {
                objects.push(StorageObject {
                    key: key.to_string(),
                    name,
                    kind: "directory",
                    size: None,
                    last_modified: None,
                    etag: None,
                });
            }
        }
    }

    for object in output.contents() {
        let Some(key) = object.key() else {
            continue;
        };
        if key == normalized_prefix || key.ends_with('/') {
            continue;
        }
        let name = key.rsplit('/').next().unwrap_or_default().to_string();
        objects.push(StorageObject {
            key: key.to_string(),
            name,
            kind: "file",
            size: object.size(),
            last_modified: object.last_modified().map(ToString::to_string),
            etag: object.e_tag().map(ToOwned::to_owned),
        });
    }

    Ok(StorageObjectPage {
        objects,
        next_token: output.next_continuation_token().map(ToOwned::to_owned),
    })
}

pub(crate) async fn count_objects(
    client: &Client,
    bucket: &str,
    prefix: &str,
) -> Result<usize, String> {
    let normalized_prefix = if prefix.is_empty() {
        String::new()
    } else {
        format!("{}/", prefix.trim_matches('/'))
    };
    let mut total = 0usize;
    let mut continuation_token: Option<String> = None;

    loop {
        let mut request = client
            .list_objects_v2()
            .bucket(bucket)
            .prefix(&normalized_prefix)
            .delimiter("/")
            .max_keys(COUNT_PAGE_SIZE);
        if let Some(token) = continuation_token.as_deref() {
            request = request.continuation_token(token);
        }

        let output = request
            .send()
            .await
            .map_err(|error| format_storage_error(&error))?;
        total += output.common_prefixes().len();
        total += output
            .contents()
            .iter()
            .filter(|object| {
                object
                    .key()
                    .is_some_and(|key| key != normalized_prefix.as_str() && !key.ends_with('/'))
            })
            .count();

        continuation_token = output.next_continuation_token().map(ToOwned::to_owned);
        if continuation_token.is_none() {
            return Ok(total);
        }
    }
}

pub(crate) async fn fetch_object_preview(
    client: &Client,
    bucket: &str,
    key: &str,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    if key.is_empty() || key.ends_with('/') {
        return Err("只能预览文件对象。".to_string());
    }

    let output = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|error| format_storage_error(&error))?;
    let too_large = || format!("文件超过 {} MiB，请下载后查看。", max_bytes / (1024 * 1024));
    if output.content_length().unwrap_or_default() > max_bytes as i64 {
        return Err(too_large());
    }

    let mut body = output.body.into_async_read();
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = body
            .read(&mut buffer)
            .await
            .map_err(|error| format!("读取文件预览失败：{error}"))?;
        if count == 0 {
            break;
        }
        if count > max_bytes - bytes.len() {
            return Err(too_large());
        }
        bytes.extend_from_slice(&buffer[..count]);
    }
    Ok(bytes)
}

pub(crate) async fn delete_objects(
    client: &Client,
    bucket: &str,
    keys: Vec<String>,
) -> Result<DeleteObjectsResult, String> {
    if keys.is_empty() {
        return Ok(DeleteObjectsResult {
            deleted_count: 0,
            failed_keys: Vec::new(),
        });
    }

    let mut object_keys = HashSet::new();
    for key in keys {
        if key.is_empty() {
            return Err("不能删除空的对象 Key。".to_string());
        }

        if key.ends_with('/') {
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
                let page = request
                    .send()
                    .await
                    .map_err(|error| format_storage_error(&error))?;
                for object in page.contents() {
                    if let Some(object_key) = object.key() {
                        object_keys.insert(object_key.to_string());
                    }
                }
                continuation_token = page.next_continuation_token().map(ToOwned::to_owned);
                if continuation_token.is_none() {
                    break;
                }
            }
        } else {
            object_keys.insert(key);
        }
    }

    let mut result = DeleteObjectsResult {
        deleted_count: 0,
        failed_keys: Vec::new(),
    };
    let object_keys = object_keys.into_iter().collect::<Vec<_>>();
    for batch in object_keys.chunks(DELETE_BATCH_SIZE) {
        let identifiers = batch
            .iter()
            .map(|key| {
                ObjectIdentifier::builder()
                    .key(key)
                    .build()
                    .map_err(|error| format!("无法构建删除请求：{error}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let delete = Delete::builder()
            .set_objects(Some(identifiers))
            .build()
            .map_err(|error| format!("无法构建删除请求：{error}"))?;
        let output = client
            .delete_objects()
            .bucket(bucket)
            .delete(delete)
            .send()
            .await
            .map_err(|error| format_storage_error(&error))?;
        result.deleted_count += output.deleted().len();
        result.failed_keys.extend(
            output
                .errors()
                .iter()
                .filter_map(|error| error.key().map(ToOwned::to_owned)),
        );
    }

    Ok(result)
}

pub(crate) async fn create_folder(
    client: &Client,
    bucket: &str,
    prefix: String,
    name: String,
) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("请输入文件夹名称。".to_string());
    }
    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("文件夹名称不能包含路径分隔符或使用 .、..。".to_string());
    }

    let prefix = prefix.trim_matches('/');
    let key = if prefix.is_empty() {
        format!("{name}/")
    } else {
        format!("{prefix}/{name}/")
    };

    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(aws_sdk_s3::primitives::ByteStream::from_static(b""))
        .send()
        .await
        .map_err(|error| format_storage_error(&error))?;

    Ok(())
}
