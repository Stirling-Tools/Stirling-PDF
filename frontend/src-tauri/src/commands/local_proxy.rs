//! Fast-path transport for LOCALHOST binary traffic to the bundled backend.
//!
//! `@tauri-apps/plugin-http` marshals request/response bodies across the IPC
//! bridge as a JSON array of per-byte numbers (~3.5x size bloat plus heavy GC),
//! which is painful for large PDF uploads/downloads. This command moves the
//! raw bytes across IPC as `InvokeBody::Raw` instead, carrying the request and
//! response metadata in a small length-prefixed frame alongside the untouched
//! body:
//!
//! ```text
//!   frame = [u32 BE meta_len][meta JSON (utf-8)][raw body bytes]
//! ```
//!
//! It is intentionally scoped to loopback URLs only (validated by parsing the
//! host to an `IpAddr`), and the shared client disables redirects, so it can
//! never be used as a general outbound request primitive — a 3xx pointing
//! off-host is not followed (no SSRF / arbitrary-URL fetch).

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri_plugin_http::reqwest::header::{HeaderName, HeaderValue};
use tauri_plugin_http::reqwest::{redirect::Policy, Client, Method};
use url::{Host, Url};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyRequestMeta {
    method: String,
    url: String,
    headers: Vec<(String, String)>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyResponseMeta {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
}

/// Process-wide client: pools connections / keeps them alive across the many
/// calls a session makes, and disables redirects so the loopback guarantee
/// can't be escaped via a 3xx `Location` to a non-loopback host.
fn http_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .redirect(Policy::none())
            .build()
            .expect("failed to build local-proxy reqwest client")
    })
}

/// Only loopback hosts are permitted — this is a bundled-backend shortcut, not
/// a general HTTP proxy. Parsing to an `IpAddr` covers all of 127.0.0.0/8 and
/// `::1` in any spelling, rather than matching a few exact strings.
fn is_loopback_host(url: &Url) -> bool {
    match url.host() {
        Some(Host::Ipv4(ip)) => ip.is_loopback(),
        Some(Host::Ipv6(ip)) => ip.is_loopback(),
        Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        None => false,
    }
}

/// Proxy a single request to the bundled localhost backend, moving the body as
/// raw bytes instead of the plugin-http number-array. See the module docs for
/// the frame layout.
#[tauri::command]
pub async fn proxy_local_pdf_request(request: Request<'_>) -> Result<Response, String> {
    let frame = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        InvokeBody::Json(_) => {
            return Err("proxy_local_pdf_request: expected a raw body".into());
        }
    };

    if frame.len() < 4 {
        return Err("proxy_local_pdf_request: frame too short".into());
    }
    let meta_len = u32::from_be_bytes([frame[0], frame[1], frame[2], frame[3]]) as usize;
    let meta_end = 4usize
        .checked_add(meta_len)
        .ok_or("proxy_local_pdf_request: meta length overflow")?;
    if frame.len() < meta_end {
        return Err("proxy_local_pdf_request: frame truncated".into());
    }

    let meta: ProxyRequestMeta =
        serde_json::from_slice(&frame[4..meta_end]).map_err(|e| e.to_string())?;
    let body = frame[meta_end..].to_vec();

    let url = Url::parse(&meta.url).map_err(|e| e.to_string())?;
    if !is_loopback_host(&url) {
        return Err(format!(
            "proxy_local_pdf_request: refusing non-loopback url: {}",
            meta.url
        ));
    }
    let method = Method::from_bytes(meta.method.as_bytes()).map_err(|e| e.to_string())?;

    let mut builder = http_client().request(method, url);
    for (name, value) in &meta.headers {
        // Build the header explicitly and skip any invalid pair, rather than
        // letting one malformed header fail the whole request opaquely at send().
        if let (Ok(header_name), Ok(header_value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            builder = builder.header(header_name, header_value);
        }
    }
    if !body.is_empty() {
        builder = builder.body(body);
    }

    let response = builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (name.as_str().to_string(), v.to_string()))
        })
        .collect();
    let body_bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let meta_out = ProxyResponseMeta {
        status: status.as_u16(),
        status_text,
        headers,
    };
    let meta_json = serde_json::to_vec(&meta_out).map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(4 + meta_json.len() + body_bytes.len());
    out.extend_from_slice(&(meta_json.len() as u32).to_be_bytes());
    out.extend_from_slice(&meta_json);
    out.extend_from_slice(&body_bytes);

    Ok(Response::new(out))
}
