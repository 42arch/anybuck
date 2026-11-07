//! Application-wide branding, namespace, and storage constants.

/// Core application identifier / brand name (lowercase).
pub(crate) const APP_NAME: &str = "anybuck";

/// Legacy Tauri bundle identifier used to locate existing Application Support directories.
pub(crate) const LEGACY_APP_IDENTIFIER: &str = "com.starllow.cloudstore";

/// Keyring service domain prefix for the current version (e.g. `com.anybuck`).
pub(crate) const KEYRING_SERVICE_PREFIX: &str = "com.anybuck";

/// Keyring service domain prefix for legacy cloudstore versions (e.g. `com.cloudstore`).
pub(crate) const LEGACY_KEYRING_SERVICE_PREFIX: &str = "com.cloudstore";

/// Bucket prefix used for isolating compatibility validation probes.
pub(crate) const COMPAT_PROBE_PREFIX: &str = "__anybuck-compat";

/// Sample probe payload bytes.
pub(crate) const COMPAT_PROBE_SAMPLE: &[u8] = b"anybuck compatibility probe\n";

/// Generates a provider credential client label (e.g. `anybuck-aws-s3`).
pub(crate) fn provider_client_label(provider_slug: &str) -> &'static str {
    match provider_slug {
        "aws-s3" => "anybuck-aws-s3",
        "r2" => "anybuck-r2",
        "cos" => "anybuck-cos",
        "oss" => "anybuck-oss",
        "gcs" => "anybuck-gcs",
        "kodo" => "anybuck-kodo",
        "tos" => "anybuck-tos",
        _ => "anybuck-s3",
    }
}
