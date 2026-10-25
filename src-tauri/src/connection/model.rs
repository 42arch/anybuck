use crate::storage::s3::objects::StorageObject;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StorageProvider {
    #[default]
    CloudflareR2,
    AwsS3,
    TencentCos,
    AliyunOss,
    GoogleCloudStorage,
    QiniuKodo,
    VolcengineTos,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectStorageRequest {
    pub(crate) connection_id: Option<String>,
    #[serde(default)]
    pub(crate) provider: StorageProvider,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) account_id: String,
    #[serde(default)]
    pub(crate) region: String,
    pub(crate) endpoint: Option<String>,
    pub(crate) access_key_id: String,
    pub(crate) secret_access_key: String,
    #[serde(default)]
    pub(crate) session_token: String,
    pub(crate) bucket: String,
    #[serde(default)]
    pub(crate) remember_connection: bool,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedStorageConnection {
    #[serde(default)]
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) provider: StorageProvider,
    #[serde(default)]
    pub(crate) region: String,
    #[serde(default)]
    pub(crate) account_id: String,
    pub(crate) endpoint: String,
    pub(crate) bucket: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStorageConnectionRequest {
    pub(crate) connection_id: String,
    pub(crate) name: String,
    pub(crate) account_id: String,
    pub(crate) region: String,
    pub(crate) endpoint: Option<String>,
    pub(crate) bucket: String,
    pub(crate) credentials: Option<SavedStorageCredentials>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedStorageCredentials {
    pub(crate) access_key_id: String,
    pub(crate) secret_access_key: String,
    #[serde(default)]
    pub(crate) session_token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageConnectionResult {
    pub(crate) connection_id: String,
    pub(crate) provider: StorageProvider,
    pub(crate) name: String,
    pub(crate) bucket: String,
    pub(crate) endpoint: String,
    pub(crate) objects: Vec<StorageObject>,
    pub(crate) next_token: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{SavedStorageConnection, SavedStorageCredentials, StorageProvider};

    #[test]
    fn saved_profile_contains_no_access_keys() {
        let profile = SavedStorageConnection {
            id: "r2-test".to_string(),
            name: "Assets".to_string(),
            provider: StorageProvider::CloudflareR2,
            region: String::new(),
            account_id: "0123456789abcdef0123456789abcdef".to_string(),
            endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
                .to_string(),
            bucket: "assets".to_string(),
        };
        let serialized = serde_json::to_string(&profile).unwrap();

        assert!(!serialized.contains("accessKeyId"));
        assert!(!serialized.contains("secretAccessKey"));
        assert!(serialized.contains("assets"));
    }

    #[test]
    fn legacy_r2_profile_defaults_to_r2() {
        let profile: SavedStorageConnection = serde_json::from_str(r#"{"id":"old","name":"Old","accountId":"0123456789abcdef0123456789abcdef","endpoint":"https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com","bucket":"assets"}"#).unwrap();
        assert_eq!(profile.provider, StorageProvider::CloudflareR2);
        assert!(profile.region.is_empty());
    }

    #[test]
    fn oss_provider_serializes_for_ipc_and_saved_connections() {
        let value = serde_json::to_string(&StorageProvider::AliyunOss).unwrap();
        assert_eq!(value, "\"aliyun-oss\"");
        assert_eq!(
            serde_json::from_str::<StorageProvider>(&value).unwrap(),
            StorageProvider::AliyunOss
        );
    }

    #[test]
    fn gcs_provider_serializes_for_ipc_and_saved_connections() {
        let value = serde_json::to_string(&StorageProvider::GoogleCloudStorage).unwrap();
        assert_eq!(value, "\"google-cloud-storage\"");
        assert_eq!(
            serde_json::from_str::<StorageProvider>(&value).unwrap(),
            StorageProvider::GoogleCloudStorage
        );
    }

    #[test]
    fn kodo_and_tos_providers_serialize_for_ipc_and_saved_connections() {
        for (provider, name) in [
            (StorageProvider::QiniuKodo, "qiniu-kodo"),
            (StorageProvider::VolcengineTos, "volcengine-tos"),
        ] {
            let value = serde_json::to_string(&provider).unwrap();
            assert_eq!(value, format!("\"{name}\""));
            assert_eq!(
                serde_json::from_str::<StorageProvider>(&value).unwrap(),
                provider
            );
        }
    }

    #[test]
    fn aws_provider_and_legacy_credentials_round_trip() {
        let value = serde_json::to_string(&StorageProvider::AwsS3).unwrap();
        assert_eq!(value, "\"aws-s3\"");
        assert_eq!(
            serde_json::from_str::<StorageProvider>(&value).unwrap(),
            StorageProvider::AwsS3
        );
        let credentials: SavedStorageCredentials =
            serde_json::from_str(r#"{"accessKeyId":"key","secretAccessKey":"secret"}"#).unwrap();
        assert!(credentials.session_token.is_empty());
    }
}
