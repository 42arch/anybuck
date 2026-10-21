use crate::connection::model::{SavedR2Connection, SavedR2Credentials};
use crate::security::credentials::{credential_entry, keyring_error, restore_previous_secret};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const KEYRING_USERNAME: &str = "primary";
const PROFILE_FILE: &str = "r2-connection.json";

pub(crate) fn load_saved_connections(app: &AppHandle) -> Result<Vec<SavedR2Connection>, String> {
    let path = profile_path(app)?;
    match fs::read(path) {
        Ok(contents) => {
            let value: serde_json::Value = serde_json::from_slice(&contents)
                .map_err(|error| format!("已保存的存储连接信息无法读取：{error}"))?;
            if value.is_array() {
                serde_json::from_value(value)
                    .map_err(|error| format!("已保存的存储连接信息无法读取：{error}"))
            } else {
                let mut profile: SavedR2Connection = serde_json::from_value(value)
                    .map_err(|error| format!("已保存的存储连接信息无法读取：{error}"))?;
                // Migrate the previous single-profile format and preserve its keyring entry.
                profile.id = KEYRING_USERNAME.to_string();
                if profile.name.is_empty() {
                    profile.name = profile.bucket.clone();
                }
                Ok(vec![profile])
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(format!("无法读取存储连接信息：{error}")),
    }
}

pub(crate) fn save_connection(
    app: &AppHandle,
    profile: &SavedR2Connection,
    credentials: &SavedR2Credentials,
) -> Result<(), String> {
    let path = profile_path(app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "应用数据目录无效。".to_string())?;
    fs::create_dir_all(directory).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    let mut profiles = load_saved_connections(app)?;
    profiles.retain(|saved| saved.id != profile.id);
    profiles.push(profile.clone());
    let profile_bytes = serde_json::to_vec(&profiles)
        .map_err(|error| format!("无法序列化存储连接信息：{error}"))?;
    let credentials = serde_json::to_string(credentials)
        .map_err(|error| format!("无法序列化系统凭证：{error}"))?;
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
        return Err(format!("无法保存存储连接信息：{error}"));
    }
    Ok(())
}

pub(crate) fn remove_saved_connection(app: &AppHandle, connection_id: &str) -> Result<(), String> {
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
        fs::remove_file(&path).map_err(|error| format!("无法删除已保存的连接信息：{error}"))?;
    } else {
        let contents = serde_json::to_vec(&profiles)
            .map_err(|error| format!("无法序列化存储连接信息：{error}"))?;
        fs::write(&path, contents).map_err(|error| format!("无法更新已保存的连接信息：{error}"))?;
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

fn profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(PROFILE_FILE))
        .map_err(|error| format!("无法定位应用数据目录：{error}"))
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
