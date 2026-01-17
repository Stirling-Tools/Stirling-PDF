use keyring::{Entry};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use tiny_http::{Response, Server};
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::{thread_rng, Rng};
use rand::distributions::Alphanumeric;

const STORE_FILE: &str = "connection.json";
const USER_INFO_KEY: &str = "user_info";
const KEYRING_SERVICE: &str = "stirling-pdf";
const KEYRING_TOKEN_KEY: &str = "auth-token";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
    pub username: String,
    pub email: Option<String>,
}

fn get_keyring_entry() -> Result<Entry, String> {
    log::debug!("Creating keyring entry with service='{}' username='{}'", KEYRING_SERVICE, KEYRING_TOKEN_KEY);
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_KEY)
        .map_err(|e| {
            log::error!("Failed to create keyring entry: {}", e);
            format!("Failed to access keyring: {}", e)
        })?;
    log::debug!("Keyring entry created successfully");
    Ok(entry)
}

#[tauri::command]
pub async fn save_auth_token(_app_handle: AppHandle, token: String) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        log::warn!("Attempted to save empty auth token");
        return Err("Token cannot be empty".to_string());
    }

    let entry = get_keyring_entry()?;

    if trimmed.len() != token.len() {
        log::debug!("Auth token had surrounding whitespace; storing trimmed token");
    }

    entry
        .set_password(trimmed)
        .map_err(|e| {
            log::error!("Failed to set password in keyring: {}", e);
            format!("Failed to save token to keyring: {}", e)
        })?;

    // Verify the save worked
    match entry.get_password() {
        Ok(retrieved_token) => {
            if retrieved_token != trimmed {
                log::error!("Token verification failed: Retrieved token doesn't match");
                return Err("Token verification failed after save".to_string());
            }
        }
        Err(e) => {
            log::error!("Token verification failed: {}", e);
            return Err(format!("Token verification failed: {}", e));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_auth_token(_app_handle: AppHandle) -> Result<Option<String>, String> {
    let entry = get_keyring_entry()?;

    match entry.get_password() {
        Ok(token) => {
            let trimmed = token.trim();
            if trimmed.is_empty() {
                log::warn!("Retrieved empty auth token from keyring; treating as missing");
                if let Err(err) = entry.delete_credential() {
                    log::warn!("Failed to delete empty keyring token: {}", err);
                }
                Ok(None)
            } else {
                if trimmed.len() != token.len() {
                    if let Err(err) = entry.set_password(trimmed) {
                        log::warn!("Failed to normalize keyring token whitespace: {}", err);
                    }
                }
                Ok(Some(trimmed.to_string()))
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => {
            log::error!("Failed to retrieve token from keyring: {}", e);
            Err(format!("Failed to retrieve token: {}", e))
        },
    }
}

#[tauri::command]
pub async fn clear_auth_token(_app_handle: AppHandle) -> Result<(), String> {
    let entry = get_keyring_entry()?;

    // Delete the token - ignore error if it doesn't exist
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            log::warn!("Failed to delete keyring credential: {}. Attempting overwrite with empty token.", e);
            // As a fallback, overwrite with an empty token so a stale value cannot be reused
            match entry.set_password("") {
                Ok(_) => Ok(()),
                Err(e2) => Err(format!("Failed to clear token (delete + overwrite failed): {}", e2)),
            }
        },
    }
}

#[tauri::command]
pub async fn save_user_info(
    app_handle: AppHandle,
    username: String,
    email: Option<String>,
) -> Result<(), String> {
    let user_info = UserInfo { username, email };

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.set(
        USER_INFO_KEY,
        serde_json::to_value(&user_info)
            .map_err(|e| format!("Failed to serialize user info: {}", e))?,
    );

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_user_info(app_handle: AppHandle) -> Result<Option<UserInfo>, String> {
    log::debug!("Retrieving user info");

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let user_info: Option<UserInfo> = store
        .get(USER_INFO_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    Ok(user_info)
}

#[tauri::command]
pub async fn clear_user_info(app_handle: AppHandle) -> Result<(), String> {
    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.delete(USER_INFO_KEY);

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

// Response types for Spring Boot login (self-hosted)
#[derive(Debug, Deserialize)]
struct SpringBootSession {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct SpringBootUser {
    username: String,
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SpringBootLoginResponse {
    session: SpringBootSession,
    user: SpringBootUser,
}

// Response types for Supabase login (SaaS)
#[derive(Debug, Deserialize)]
struct SupabaseUserMetadata {
    full_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SupabaseUser {
    email: Option<String>,
    user_metadata: Option<SupabaseUserMetadata>,
}

#[derive(Debug, Deserialize)]
struct SupabaseLoginResponse {
    access_token: String,
    user: SupabaseUser,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub username: String,
    pub email: Option<String>,
}

/// Login command - makes HTTP request from Rust to bypass CORS
/// Supports both Supabase authentication (SaaS) and Spring Boot authentication (self-hosted)
#[tauri::command]
pub async fn login(
    server_url: String,
    username: String,
    password: String,
    mfa_code: Option<String>,
    supabase_key: String,
    saas_server_url: String,
) -> Result<LoginResponse, String> {
    // Detect if this is Supabase (SaaS) or Spring Boot (self-hosted)
    let is_supabase = server_url.trim_end_matches('/') == saas_server_url.trim_end_matches('/');

    // Create HTTP client
    let client = reqwest::Client::new();

    if is_supabase {
        // Supabase authentication flow
        let login_url = format!("{}/auth/v1/token?grant_type=password", server_url.trim_end_matches('/'));

        let request_body = serde_json::json!({
            "email": username,
            "password": password,
        });

        let response = client
            .post(&login_url)
            .header("Content-Type", "application/json;charset=UTF-8")
            .header("apikey", &supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .header("X-Client-Info", "supabase-js-web/2.58.0")
            .header("X-Supabase-Api-Version", "2024-01-01")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            log::error!("Supabase login failed with status {}: {}", status, error_text);

            return Err(if status.as_u16() == 400 || status.as_u16() == 401 {
                "Invalid username or password".to_string()
            } else if status.as_u16() == 403 {
                "Access denied".to_string()
            } else {
                format!("Login failed: {}", status)
            });
        }

        // Parse Supabase response format
        let login_response: SupabaseLoginResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Supabase response: {}", e))?;

        let email = login_response.user.email.clone();
        let username = login_response.user.user_metadata
            .as_ref()
            .and_then(|m| m.full_name.clone())
            .or_else(|| email.clone())
            .unwrap_or_else(|| username);

        Ok(LoginResponse {
            token: login_response.access_token,
            username,
            email,
        })
    } else {
        // Spring Boot authentication flow
        let login_url = format!("{}/api/v1/auth/login", server_url.trim_end_matches('/'));
        log::debug!("Spring Boot login URL: {}", login_url);

        let mut payload = serde_json::json!({
            "username": username,
            "password": password,
        });

        if let Some(code) = mfa_code
            .as_ref()
            .map(|c| c.trim())
            .filter(|c| !c.is_empty())
        {
            payload["mfaCode"] = serde_json::Value::String(code.to_string());
        }

        let response = client
            .post(&login_url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let status = response.status();
        log::debug!("Spring Boot login response status: {}", status);

        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            log::error!("Spring Boot login failed with status {}: {}", status, error_text);

            if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&error_text) {
                let error_code = error_json
                    .get("error")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string());

                if let Some(code) = error_code {
                    if code == "mfa_required" || code == "invalid_mfa_code" {
                        return Err(code);
                    }
                }
            }

            return Err(if status.as_u16() == 401 {
                "Invalid username or password".to_string()
            } else if status.as_u16() == 403 {
                "Access denied".to_string()
            } else {
                format!("Login failed: {}", status)
            });
        }

        // Parse Spring Boot response format
        let login_response: SpringBootLoginResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Spring Boot response: {}", e))?;

        log::info!("Spring Boot login successful for user: {}", login_response.user.username);

        Ok(LoginResponse {
            token: login_response.session.access_token,
            username: login_response.user.username,
            email: login_response.user.email,
        })
    }
}

/// Generate PKCE code_verifier (random 43-128 character string)
fn generate_code_verifier() -> String {
    thread_rng()
        .sample_iter(&Alphanumeric)
        .take(128)
        .map(char::from)
        .collect()
}

/// Generate PKCE code_challenge from code_verifier (SHA256 hash, base64url encoded)
fn generate_code_challenge(code_verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(hash)
}

/// Opens the system browser for OAuth authentication with localhost callback server
/// Uses 127.0.0.1 (loopback) which is supported by Google OAuth with any port
/// Implements PKCE (Proof Key for Code Exchange) for secure OAuth flow
#[tauri::command]
pub async fn start_oauth_login(
    _app_handle: AppHandle,
    provider: String,
    auth_server_url: String,
    supabase_key: String,
    success_html: String,
    error_html: String,
) -> Result<OAuthCallbackResult, String> {
    log::info!("Starting OAuth login for provider: {} with auth server: {}", provider, auth_server_url);

    // Generate PKCE code_verifier and code_challenge
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);

    log::debug!("PKCE code_verifier generated: {} chars", code_verifier.len());
    log::debug!("PKCE code_challenge: {}", code_challenge);

    // Use port 0 to let OS assign an available port (avoids port reuse issues)
    // Supabase allows any localhost port via redirect_to parameter
    let server = Server::http("127.0.0.1:0")
        .map_err(|e| format!("Failed to create OAuth callback server: {}", e))?;

    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(addr) => addr.port(),
        #[cfg(unix)]
        tiny_http::ListenAddr::Unix(_) => {
            return Err("OAuth callback server bound to Unix socket instead of TCP port".to_string())
        }
    };

    let callback_url = format!("http://127.0.0.1:{}/callback", port);
    log::info!("OAuth callback URL: {}", callback_url);

    // Build OAuth URL with authorization code flow + PKCE
    // Note: Use redirect_to (not redirect_uri) to tell Supabase where to redirect after processing
    // Supabase handles its own /auth/v1/callback internally
    // prompt=select_account forces Google to show account picker every time
    let oauth_url = format!(
        "{}/auth/v1/authorize?provider={}&redirect_to={}&code_challenge={}&code_challenge_method=S256&prompt=select_account",
        auth_server_url.trim_end_matches('/'),
        provider,
        urlencoding::encode(&callback_url),
        urlencoding::encode(&code_challenge)
    );

    log::info!("Full OAuth URL: {}", oauth_url);
    log::info!("========================================");

    // Open system browser
    if let Err(e) = tauri_plugin_opener::open_url(&oauth_url, None::<&str>) {
        log::error!("Failed to open browser: {}", e);
        return Err(format!("Failed to open browser: {}", e));
    }

    // Wait for OAuth callback with timeout
    let result = Arc::new(Mutex::new(None));
    let result_clone = Arc::clone(&result);

    // Spawn server handling in blocking thread
    let server_handle = std::thread::spawn(move || {
        log::info!("Waiting for OAuth callback...");

        // Wait for callback (with timeout)
        for _ in 0..120 { // 2 minute timeout
            if let Ok(Some(request)) = server.recv_timeout(std::time::Duration::from_secs(1)) {
                let url_str = format!("http://127.0.0.1{}", request.url());
                log::debug!("Received OAuth callback: {}", url_str);

                // Parse the authorization code from URL
                let callback_data = parse_oauth_callback(&url_str);

                // Respond with appropriate HTML based on result
                let html_response = match &callback_data {
                    Ok(_) => {
                        log::info!("Successfully extracted authorization code");
                        success_html.clone()
                    }
                    Err(error_msg) => {
                        log::warn!("OAuth callback error: {}", error_msg);
                        // Replace {error} placeholder with actual error message
                        error_html.replace("{error}", error_msg)
                    }
                };

                let response = Response::from_string(html_response)
                    .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap())
                    .with_header(tiny_http::Header::from_bytes(&b"Connection"[..], &b"close"[..]).unwrap());

                let _ = request.respond(response);

                // Store result and exit loop
                let mut result_lock = result_clone.lock().unwrap();
                *result_lock = Some(callback_data);
                break;
            }
        }
    });

    // Wait for server thread to complete
    server_handle.join()
        .map_err(|_| "OAuth callback server thread panicked".to_string())?;

    // Get result
    let callback_data = result.lock().unwrap().take()
        .ok_or_else(|| "OAuth callback timeout - no response received".to_string())?;

    // Handle the callback data - exchange authorization code for tokens
    match callback_data? {
        OAuthCallbackData::Code { code, redirect_uri } => {
            log::info!("OAuth completed with authorization code flow, exchanging code...");
            exchange_code_for_token(&auth_server_url, &code, &redirect_uri, &code_verifier, &supabase_key).await
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthCallbackResult {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
}

// Internal enum for handling authorization code flow
#[derive(Debug, Clone)]
enum OAuthCallbackData {
    Code { code: String, redirect_uri: String },
}

/// Exchange authorization code for access token using PKCE
async fn exchange_code_for_token(
    auth_server_url: &str,
    code: &str,
    _redirect_uri: &str,
    code_verifier: &str,
    supabase_key: &str,
) -> Result<OAuthCallbackResult, String> {
    log::info!("Exchanging authorization code for access token with PKCE");

    let client = reqwest::Client::new();
    // grant_type goes in query string, not body!
    let token_url = format!("{}/auth/v1/token?grant_type=pkce", auth_server_url.trim_end_matches('/'));

    // Body should be JSON with auth_code and code_verifier
    let body = serde_json::json!({
        "auth_code": code,
        "code_verifier": code_verifier,
    });

    log::debug!("Token exchange URL: {}", token_url);
    log::debug!("Code verifier length: {} chars", code_verifier.len());

    let response = client
        .post(&token_url)
        .header("Content-Type", "application/json")
        .header("apikey", supabase_key)
        .header("Authorization", format!("Bearer {}", supabase_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to exchange code for token: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        log::error!("Token exchange failed with status {}: {}", status, error_text);
        return Err(format!("Token exchange failed: {}", error_text));
    }

    // Parse token response
    let token_response: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    log::info!("Token exchange successful");

    let access_token = token_response
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "No access_token in token response".to_string())?
        .to_string();

    let refresh_token = token_response
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let expires_in = token_response
        .get("expires_in")
        .and_then(|v| v.as_i64());

    Ok(OAuthCallbackResult {
        access_token,
        refresh_token,
        expires_in,
    })
}

fn parse_oauth_callback(url_str: &str) -> Result<OAuthCallbackData, String> {
    // Parse URL to extract authorization code or error
    let parsed_url = url::Url::parse(url_str)
        .map_err(|e| format!("Failed to parse callback URL: {}", e))?;

    // Check for OAuth error first (error responses take precedence)
    let mut error = None;
    let mut error_description = None;
    let mut code = None;

    for (key, value) in parsed_url.query_pairs() {
        match key.as_ref() {
            "error" => error = Some(value.to_string()),
            "error_description" => error_description = Some(value.to_string()),
            "code" => code = Some(value.to_string()),
            _ => {}
        }
    }

    // If OAuth provider returned an error, fail immediately
    if let Some(error_code) = error {
        let error_msg = if let Some(description) = error_description {
            format!("OAuth authentication failed: {} - {}", error_code, description)
        } else {
            format!("OAuth authentication failed: {}", error_code)
        };
        log::error!("{}", error_msg);
        return Err(error_msg);
    }

    // If we have a code, return it
    if let Some(auth_code) = code {
        log::info!("Found authorization code in callback");

        // Reconstruct the redirect_uri (without query params) for token exchange
        let redirect_uri = if let Some(port) = parsed_url.port() {
            format!("{}://{}:{}{}",
                parsed_url.scheme(),
                parsed_url.host_str().unwrap_or("127.0.0.1"),
                port,
                parsed_url.path()
            )
        } else {
            format!("{}://{}{}",
                parsed_url.scheme(),
                parsed_url.host_str().unwrap_or("127.0.0.1"),
                parsed_url.path()
            )
        };

        return Ok(OAuthCallbackData::Code {
            code: auth_code,
            redirect_uri,
        });
    }

    // No authorization code or error found
    Err("No authorization code or error found in OAuth callback".to_string())
}
