use serde::Serialize;
use std::{collections::BTreeMap, fmt};

/// Stable machine-readable error categories shared across Rust and the UI.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    ConnectionInvalidId,
    ConnectionInvalidName,
    ConnectionNotFound,
    ConnectionChanged,
    ConnectionTargetBusy,
    ConnectionSessionUnavailable,
    ConnectionStateUnavailable,
    ConnectionCredentialsUnavailable,
    ConnectionSaveFailed,
    ConnectionLoadFailed,
    ConnectionRenameFailed,
    ConnectionUpdateFailed,
    ConnectionDeleteFailed,
    ConnectionInvalidCredentials,
    ConnectionInvalidRegion,
    ConnectionInvalidBucket,
    ConnectionInvalidEndpoint,
    ConnectionInvalidAccountId,
    ConnectionDataUnavailable,
    ObjectsPreviewFailed,
    ObjectsInvalidFolderName,
    ObjectsInvalidKey,
    ObjectsPreviewTooLarge,
    StorageRequestFailed,
    StorageResponseInvalid,
    TransferListFailed,
    TransferPlanFailed,
    TransferHistoryFailed,
    TransferTaskNotFound,
    TransferRetryNotAllowed,
    TransferBucketChanged,
    TransferDestinationBucketChanged,
    TransferDuplicateKeys,
    TransferInvalidOperation,
    TransferInvalidConflictAction,
    TransferInvalidDestination,
    TransferUnsafePath,
    TransferInvalidSource,
    TransferUnsupportedItem,
    TransferLimitExceeded,
    TransferConflict,
    TransferSourceChanged,
    TransferDestinationChanged,
    TransferVerificationFailed,
    TransferLocalReadFailed,
    TransferLocalWriteFailed,
    TransferMultipartFailed,
    TransferCancelled,
    TransferOutcomeUncertain,
    PublicUrlInvalid,
    PublicUrlMissingHost,
    PublicUrlRequiresHttps,
    PublicUrlProbeFailed,
    PublicUrlHttpFailure,
}

/// IPC error payload; user-facing messages are translated by the frontend.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    /// Values used by localized message templates.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub params: BTreeMap<String, String>,
    /// Raw OS or cloud-service context, never a localized diagnostic sentence.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: ErrorCode) -> Self {
        Self {
            code,
            params: BTreeMap::new(),
            detail: None,
        }
    }

    pub fn with_detail(code: ErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            params: BTreeMap::new(),
            detail: Some(detail.into()),
        }
    }

    pub fn param(mut self, key: &str, value: impl ToString) -> Self {
        self.params.insert(key.to_string(), value.to_string());
        self
    }

    pub fn code_key(&self) -> String {
        let name = format!("{:?}", self.code);
        let mut characters = name.chars();
        characters.next().unwrap().to_ascii_lowercase().to_string() + characters.as_str()
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Display is for logs and error chaining. UI text is rendered by the frontend.
        write!(formatter, "{}", self.code_key())
    }
}

impl std::error::Error for AppError {}

#[cfg(test)]
mod tests {
    use super::{AppError, ErrorCode};

    #[test]
    fn serializes_code_params_and_detail_for_ipc() {
        let error =
            AppError::with_detail(ErrorCode::PublicUrlHttpFailure, "HTTP 503").param("status", 503);
        let value = serde_json::to_value(error).unwrap();
        assert_eq!(value["code"], "publicUrlHttpFailure");
        assert_eq!(value["params"]["status"], "503");
        assert_eq!(value["detail"], "HTTP 503");
    }

    #[test]
    fn preserves_explicit_code_independent_of_detail() {
        let error = AppError::with_detail(ErrorCode::TransferRetryNotAllowed, "remote SDK error");
        assert!(matches!(error.code, ErrorCode::TransferRetryNotAllowed));
        assert_eq!(error.code_key(), "transferRetryNotAllowed");
    }
}
