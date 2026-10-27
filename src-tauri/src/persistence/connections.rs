use crate::connection::model::{SavedStorageConnection, SavedStorageCredentials};
use crate::error::{AppError, ErrorCode};
use crate::security::credentials::{credential_entry, keyring_error, restore_previous_secret};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const KEYRING_USERNAME: &str = "primary";
const PROFILE_FILE: &str = "connections.json";
const LEGACY_PROFILE_FILE: &str = "r2-connection.json";

pub(crate) fn load_saved_connections(
    app: &AppHandle,
) -> Result<Vec<SavedStorageConnection>, AppError> {
    let path = profile_path(app)?;
    let file_path = if path.exists() {
        path
    } else {
        legacy_profile_path(app)?
    };
    match fs::read(file_path) {
        Ok(contents) => {
            let value: serde_json::Value = serde_json::from_slice(&contents).map_err(|error| {
                AppError::with_detail(ErrorCode::ConnectionLoadFailed, error.to_string())
            })?;
            if value.is_array() {
                serde_json::from_value(value).map_err(|error| {
                    AppError::with_detail(ErrorCode::ConnectionLoadFailed, error.to_string())
                })
            } else {
                let mut profile: SavedStorageConnection =
                    serde_json::from_value(value).map_err(|error| {
                        AppError::with_detail(ErrorCode::ConnectionLoadFailed, error.to_string())
                    })?;
                // Migrate the previous single-profile format and preserve its keyring entry.
                profile.id = KEYRING_USERNAME.to_string();
                if profile.name.is_empty() {
                    profile.name = profile.bucket.clone();
                }
                Ok(vec![profile])
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(AppError::with_detail(
            ErrorCode::ConnectionLoadFailed,
            error.to_string(),
        )),
    }
}

pub(crate) fn save_connection(
    app: &AppHandle,
    profile: &SavedStorageConnection,
    credentials: &SavedStorageCredentials,
) -> Result<(), AppError> {
    let path = profile_path(app)?;
    let directory = path
        .parent()
        .ok_or_else(|| AppError::new(ErrorCode::ConnectionDataUnavailable))?;
    fs::create_dir_all(directory).map_err(|error| {
        AppError::with_detail(ErrorCode::ConnectionDataUnavailable, error.to_string())
    })?;
    let mut profiles = load_saved_connections(app)?;
    profiles.retain(|saved| saved.id != profile.id);
    profiles.push(profile.clone());
    let profile_bytes = serde_json::to_vec(&profiles).map_err(|error| {
        AppError::with_detail(ErrorCode::ConnectionSaveFailed, error.to_string())
    })?;
    let credentials = serde_json::to_string(credentials).map_err(|error| {
        AppError::with_detail(ErrorCode::ConnectionSaveFailed, error.to_string())
    })?;
    let previous_profile = fs::read(&path).ok();
    let entry = credential_entry(profile.provider, &profile.id)?;
    let previous_secret = match entry.get_password() {
        Ok(secret) => Some(secret),
        Err(keyring::Error::NoEntry) => None,
        Err(error) => return Err(keyring_error(error)),
    };

    entry.set_password(&credentials).map_err(keyring_error)?;
    if let Err(error) = fs::write(&path, profile_bytes) {
        restore_previous_secret(&entry, previous_secret.as_deref());
        restore_previous_profile(&path, previous_profile.as_deref());
        return Err(AppError::with_detail(
            ErrorCode::ConnectionSaveFailed,
            error.to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn rename_saved_connection(
    app: &AppHandle,
    connection_id: &str,
    name: &str,
) -> Result<SavedStorageConnection, AppError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(AppError::new(ErrorCode::ConnectionInvalidName));
    }
    let mut profiles = load_saved_connections(app)?;
    let profile = profiles
        .iter_mut()
        .find(|profile| profile.id == connection_id)
        .ok_or_else(|| AppError::new(ErrorCode::ConnectionNotFound))?;
    profile.name = name.to_string();
    let updated = profile.clone();
    let contents = serde_json::to_vec(&profiles).map_err(|error| {
        AppError::with_detail(ErrorCode::ConnectionSaveFailed, error.to_string())
    })?;
    let path = profile_path(app)?;
    fs::write(&path, contents).map_err(|error| {
        AppError::with_detail(ErrorCode::ConnectionUpdateFailed, error.to_string())
    })?;
    Ok(updated)
}

pub(crate) fn remove_saved_connection(
    app: &AppHandle,
    connection_id: &str,
) -> Result<(), AppError> {
    let path = profile_path(app)?;
    let previous_profile = fs::read(&path).ok();
    let mut profiles = load_saved_connections(app)?;
    let Some(provider) = profiles
        .iter()
        .find(|profile| profile.id == connection_id)
        .map(|profile| profile.provider)
    else {
        return Ok(());
    };
    profiles.retain(|profile| profile.id != connection_id);
    if profiles.is_empty() {
        fs::remove_file(&path).map_err(|error| {
            AppError::with_detail(ErrorCode::ConnectionDeleteFailed, error.to_string())
        })?;
    } else {
        let contents = serde_json::to_vec(&profiles).map_err(|error| {
            AppError::with_detail(ErrorCode::ConnectionSaveFailed, error.to_string())
        })?;
        fs::write(&path, contents).map_err(|error| {
            AppError::with_detail(ErrorCode::ConnectionUpdateFailed, error.to_string())
        })?;
    }
    let entry = credential_entry(provider, connection_id)?;
    if let Err(error) = entry.delete_credential()
        && !matches!(error, keyring::Error::NoEntry)
    {
        restore_previous_profile(&path, previous_profile.as_deref());
        return Err(keyring_error(error));
    }
    Ok(())
}

fn profile_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(PROFILE_FILE))
        .map_err(|error| {
            AppError::with_detail(ErrorCode::ConnectionDataUnavailable, error.to_string())
        })
}

fn legacy_profile_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(LEGACY_PROFILE_FILE))
        .map_err(|error| {
            AppError::with_detail(ErrorCode::ConnectionDataUnavailable, error.to_string())
        })
}

fn restore_previous_profile(path: &PathBuf, previous_profile: Option<&[u8]>) {
    match previous_profile {
        Some(contents) => {
            let _ = fs::write(path, contents);
        }
        None => {
            let _ = fs::remove_file(path);
        }
    }
}
