use crate::connection::model::{SavedStorageCredentials, StorageProvider};
use crate::constants::{KEYRING_SERVICE_PREFIX, LEGACY_KEYRING_SERVICE_PREFIX};
use crate::error::{AppError, ErrorCode};
use keyring::Entry;

pub(crate) fn read_saved_credentials(
    provider: StorageProvider,
    connection_id: &str,
) -> Result<SavedStorageCredentials, AppError> {
    let credentials = match credential_entry(provider, connection_id)?.get_password() {
        Ok(c) => Ok(c),
        Err(keyring::Error::NoEntry) => legacy_credential_entry(provider, connection_id)?
            .get_password()
            .map_err(keyring_error),
        Err(err) => Err(keyring_error(err)),
    }?;
    serde_json::from_str(&credentials)
        .map_err(|_| AppError::new(ErrorCode::ConnectionCredentialsUnavailable))
}

pub(crate) fn credential_entry(
    provider: StorageProvider,
    connection_id: &str,
) -> Result<Entry, AppError> {
    Entry::new(&keyring_service(provider), connection_id).map_err(keyring_error)
}

pub(crate) fn legacy_credential_entry(
    provider: StorageProvider,
    connection_id: &str,
) -> Result<Entry, AppError> {
    Entry::new(&legacy_keyring_service(provider), connection_id).map_err(keyring_error)
}

fn provider_slug(provider: StorageProvider) -> &'static str {
    match provider {
        StorageProvider::CloudflareR2 => "r2",
        StorageProvider::AwsS3 => "aws-s3",
        StorageProvider::TencentCos => "cos",
        StorageProvider::AliyunOss => "oss",
        StorageProvider::GoogleCloudStorage => "gcs",
        StorageProvider::QiniuKodo => "kodo",
        StorageProvider::VolcengineTos => "tos",
    }
}

pub(crate) fn keyring_service(provider: StorageProvider) -> String {
    format!("{KEYRING_SERVICE_PREFIX}.{}", provider_slug(provider))
}

pub(crate) fn legacy_keyring_service(provider: StorageProvider) -> String {
    format!(
        "{LEGACY_KEYRING_SERVICE_PREFIX}.{}",
        provider_slug(provider)
    )
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
pub(crate) fn keyring_error(error: keyring::Error) -> AppError {
    AppError::with_detail(
        ErrorCode::ConnectionCredentialsUnavailable,
        error.to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::{keyring_service, legacy_keyring_service};
    use crate::connection::model::StorageProvider;

    #[test]
    fn provider_credentials_use_separate_services() {
        assert_eq!(
            keyring_service(StorageProvider::CloudflareR2),
            "com.anybuck.r2"
        );
        assert_eq!(
            keyring_service(StorageProvider::AwsS3),
            "com.anybuck.aws-s3"
        );
        assert_eq!(
            keyring_service(StorageProvider::TencentCos),
            "com.anybuck.cos"
        );
        assert_eq!(
            keyring_service(StorageProvider::AliyunOss),
            "com.anybuck.oss"
        );
        assert_eq!(
            keyring_service(StorageProvider::GoogleCloudStorage),
            "com.anybuck.gcs"
        );
        assert_eq!(
            keyring_service(StorageProvider::QiniuKodo),
            "com.anybuck.kodo"
        );
        assert_eq!(
            keyring_service(StorageProvider::VolcengineTos),
            "com.anybuck.tos"
        );
    }

    #[test]
    fn legacy_keyring_services_preserve_cloudstore_namespace() {
        assert_eq!(
            legacy_keyring_service(StorageProvider::CloudflareR2),
            "com.cloudstore.r2"
        );
        assert_eq!(
            legacy_keyring_service(StorageProvider::AwsS3),
            "com.cloudstore.aws-s3"
        );
    }
}
