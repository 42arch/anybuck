use crate::error::{AppError, ErrorCode};
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
};

const MAX_UPLOAD_ITEMS: usize = 10_000;
const MAX_SCAN_ENTRIES: usize = 50_000;

pub(crate) struct UploadRoot {
    pub(crate) is_folder: bool,
    pub(crate) name: String,
    pub(crate) key: String,
    pub(crate) local_path: String,
    pub(crate) items: Vec<UploadItem>,
}

pub(crate) struct UploadItem {
    pub(crate) local_path: String,
    pub(crate) key: String,
    pub(crate) name: String,
    pub(crate) size: Option<u64>,
}

fn file_name(path: &Path) -> Result<String, AppError> {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            AppError::new(ErrorCode::TransferInvalidSource).param("path", path.display())
        })
}

fn relative_key(root: &Path, path: &Path, root_key: &str) -> Result<String, AppError> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| AppError::new(ErrorCode::TransferInvalidSource))?;
    let mut components = vec![root_key.to_string()];
    for component in relative.components() {
        match component {
            Component::Normal(name) => components.push(
                name.to_str()
                    .ok_or_else(|| {
                        AppError::new(ErrorCode::TransferInvalidSource)
                            .param("path", path.display())
                    })?
                    .to_string(),
            ),
            _ => {
                return Err(
                    AppError::new(ErrorCode::TransferUnsafePath).param("path", path.display())
                );
            }
        }
    }
    Ok(components.join("/"))
}

pub(crate) fn plan_uploads(paths: Vec<String>, prefix: &str) -> Result<Vec<UploadRoot>, AppError> {
    let prefix = prefix.trim_matches('/');
    let mut roots = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut item_count = 0;
    let mut scanned_entries = 0;
    for local_path in paths {
        if !seen_paths.insert(local_path.clone()) {
            continue;
        }
        let path = PathBuf::from(&local_path);
        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
                .param("path", path.display())
        })?;
        if metadata.file_type().is_symlink() {
            return Err(
                AppError::new(ErrorCode::TransferUnsupportedItem).param("path", path.display())
            );
        }
        let name = file_name(&path)?;
        let root_key = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if metadata.is_file() {
            roots.push(UploadRoot {
                is_folder: false,
                name: name.clone(),
                key: root_key.clone(),
                local_path: local_path.clone(),
                items: vec![UploadItem {
                    local_path,
                    key: root_key,
                    name,
                    size: Some(metadata.len()),
                }],
            });
            item_count += 1;
        } else if metadata.is_dir() {
            let mut items = Vec::new();
            let mut pending = vec![path.clone()];
            while let Some(directory) = pending.pop() {
                let entries = fs::read_dir(&directory).map_err(|error| {
                    AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
                        .param("path", directory.display())
                })?;
                let mut has_entries = false;
                for entry in entries {
                    let entry = entry.map_err(|error| {
                        AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
                            .param("path", directory.display())
                    })?;
                    has_entries = true;
                    scanned_entries += 1;
                    if scanned_entries > MAX_SCAN_ENTRIES {
                        return Err(AppError::new(ErrorCode::TransferLimitExceeded)
                            .param("limit", MAX_SCAN_ENTRIES));
                    }
                    let entry_path = entry.path();
                    let entry_type = entry.file_type().map_err(|error| {
                        AppError::with_detail(ErrorCode::TransferLocalReadFailed, error.to_string())
                            .param("path", entry_path.display())
                    })?;
                    if entry_type.is_symlink() {
                        return Err(AppError::new(ErrorCode::TransferUnsupportedItem)
                            .param("path", entry_path.display()));
                    }
                    if entry_type.is_dir() {
                        pending.push(entry_path);
                    } else if entry_type.is_file() {
                        let entry_name = file_name(&entry_path)?;
                        let size = entry
                            .metadata()
                            .map_err(|error| {
                                AppError::with_detail(
                                    ErrorCode::TransferLocalReadFailed,
                                    error.to_string(),
                                )
                                .param("path", entry_path.display())
                            })?
                            .len();
                        items.push(UploadItem {
                            local_path: entry_path
                                .to_str()
                                .ok_or_else(|| {
                                    AppError::new(ErrorCode::TransferInvalidSource)
                                        .param("path", entry_path.display())
                                })?
                                .to_string(),
                            key: relative_key(&path, &entry_path, &root_key)?,
                            name: entry_name,
                            size: Some(size),
                        });
                        item_count += 1;
                    } else {
                        return Err(AppError::new(ErrorCode::TransferUnsupportedItem)
                            .param("path", entry_path.display()));
                    }
                    if item_count > MAX_UPLOAD_ITEMS {
                        return Err(AppError::new(ErrorCode::TransferLimitExceeded)
                            .param("limit", MAX_UPLOAD_ITEMS));
                    }
                }
                if !has_entries {
                    let key = format!("{}/", relative_key(&path, &directory, &root_key)?);
                    items.push(UploadItem {
                        local_path: directory
                            .to_str()
                            .ok_or_else(|| {
                                AppError::new(ErrorCode::TransferInvalidSource)
                                    .param("path", directory.display())
                            })?
                            .to_string(),
                        key,
                        name: file_name(&directory)?,
                        size: None,
                    });
                    item_count += 1;
                }
            }
            roots.push(UploadRoot {
                is_folder: true,
                name,
                key: root_key,
                local_path,
                items,
            });
        } else {
            return Err(
                AppError::new(ErrorCode::TransferUnsupportedItem).param("path", path.display())
            );
        }
        if item_count > MAX_UPLOAD_ITEMS {
            return Err(
                AppError::new(ErrorCode::TransferLimitExceeded).param("limit", MAX_UPLOAD_ITEMS)
            );
        }
    }
    Ok(roots)
}

#[cfg(test)]
mod tests {
    use super::plan_uploads;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn plans_nested_files_and_empty_directories_without_following_links() {
        let root = std::env::temp_dir().join(format!(
            "{}-upload-plan-{}-{}",
            crate::constants::APP_NAME,
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        ));
        let folder = root.join("album");
        fs::create_dir_all(folder.join("nested")).unwrap();
        fs::create_dir(folder.join("empty")).unwrap();
        fs::write(folder.join("nested/photo.jpg"), b"photo").unwrap();
        let planned = plan_uploads(vec![folder.to_string_lossy().to_string()], "photos").unwrap();
        assert_eq!(planned.len(), 1);
        assert_eq!(planned[0].key, "photos/album");
        assert!(
            planned[0]
                .items
                .iter()
                .any(|item| item.key == "photos/album/nested/photo.jpg" && item.size == Some(5))
        );
        assert!(
            planned[0]
                .items
                .iter()
                .any(|item| item.key == "photos/album/empty/" && item.size.is_none())
        );
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(PathBuf::from("nested"), folder.join("link")).unwrap();
            assert!(plan_uploads(vec![folder.to_string_lossy().to_string()], "").is_err());
        }
        fs::remove_dir_all(root).unwrap();
    }
}
