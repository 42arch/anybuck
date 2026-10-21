use crate::connection::model::{SavedR2Credentials, StorageProvider};
use keyring::Entry;

const R2_KEYRING_SERVICE: &str = "com.cloudstore.r2";
const COS_KEYRING_SERVICE: &str = "com.cloudstore.cos";

pub(crate) fn read_saved_credentials(
    provider: StorageProvider,
    connection_id: &str,
) -> Result<SavedR2Credentials, String> {
    let credentials = credential_entry(provider, connection_id)?
        .get_password()
        .map_err(keyring_error)?;
    serde_json::from_str(&credentials)
        .map_err(|_| "系统凭证库中的存储凭证格式无效，请重新连接。".to_string())
}

pub(crate) fn credential_entry(
    provider: StorageProvider,
    connection_id: &str,
) -> Result<Entry, String> {
    Entry::new(keyring_service(provider), connection_id).map_err(keyring_error)
}

fn keyring_service(provider: StorageProvider) -> &'static str {
    match provider {
        StorageProvider::CloudflareR2 => R2_KEYRING_SERVICE,
        StorageProvider::TencentCos => COS_KEYRING_SERVICE,
    }
}
pub(crate) fn restore_previous_secret(entry: &Entry, previous_secret: Option<&str>) {
    match previous_secret {
        Some(secret) => {
            let _ = entry.set_password(secret);
        }
        None => {
            let _ = entry.delete_credential();
        }
    }
}
pub(crate) fn keyring_error(error: keyring::Error) -> String {
    format!("系统凭证库不可用或无法访问：{error}")
}

#[cfg(test)]
mod tests {
    use super::{COS_KEYRING_SERVICE, R2_KEYRING_SERVICE, keyring_service};
    use crate::connection::model::StorageProvider;

    #[test]
    fn legacy_r2_and_cos_credentials_use_separate_services() {
        assert_eq!(
            keyring_service(StorageProvider::CloudflareR2),
            R2_KEYRING_SERVICE
        );
        assert_eq!(
            keyring_service(StorageProvider::TencentCos),
            COS_KEYRING_SERVICE
        );
    }
}
