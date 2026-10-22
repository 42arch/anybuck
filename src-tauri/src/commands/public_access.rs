use std::{net::IpAddr, time::Duration};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAccessProbe {
    accessible: bool,
    status_code: u16,
}

#[tauri::command]
pub async fn probe_public_object_url(url: String) -> Result<PublicAccessProbe, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "公开链接格式无效。".to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "公开链接缺少域名。".to_string())?;
    if parsed.scheme() != "https"
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || host.eq_ignore_ascii_case("localhost")
        || host.parse::<IpAddr>().is_ok()
    {
        return Err("公开链接必须使用 HTTPS 公网域名。".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| format!("无法初始化公开链接检查：{error}"))?;
    // Read only response headers. A one-byte range avoids downloading the file.
    let response = client
        .get(parsed)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(|error| format!("无法检查公开链接：{error}"))?;
    if response.status().is_server_error()
        || response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
        || response.status() == reqwest::StatusCode::REQUEST_TIMEOUT
    {
        return Err(format!("公开链接检查失败：HTTP {}", response.status()));
    }
    Ok(PublicAccessProbe {
        accessible: response.status().is_success(),
        status_code: response.status().as_u16(),
    })
}
