use crate::error::{AppError, ErrorCode};
use std::{net::IpAddr, time::Duration};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAccessProbe {
    accessible: bool,
    status_code: u16,
}

#[tauri::command]
pub async fn probe_public_object_url(url: String) -> Result<PublicAccessProbe, AppError> {
    let parsed =
        reqwest::Url::parse(&url).map_err(|_| AppError::new(ErrorCode::PublicUrlInvalid))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::new(ErrorCode::PublicUrlMissingHost))?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || host.eq_ignore_ascii_case("localhost")
        || host.parse::<IpAddr>().is_ok()
    {
        return Err(AppError::new(ErrorCode::PublicUrlRequiresHttps));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| {
            AppError::with_detail(ErrorCode::PublicUrlProbeFailed, error.to_string())
        })?;
    // Read only response headers. A one-byte range avoids downloading the file.
    let response = client
        .get(parsed)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(|error| {
            AppError::with_detail(ErrorCode::PublicUrlProbeFailed, error.to_string())
        })?;
    if response.status().is_server_error()
        || response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
        || response.status() == reqwest::StatusCode::REQUEST_TIMEOUT
    {
        return Err(AppError::new(ErrorCode::PublicUrlHttpFailure)
            .param("status", response.status().as_u16()));
    }
    Ok(PublicAccessProbe {
        accessible: response.status().is_success(),
        status_code: response.status().as_u16(),
    })
}
