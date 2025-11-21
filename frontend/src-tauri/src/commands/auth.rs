use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use tiny_http::{Response, Server};

const STORE_FILE: &str = "connection.json";
const USER_INFO_KEY: &str = "user_info";
const KEYRING_SERVICE: &str = "stirling-pdf";
const KEYRING_TOKEN_KEY: &str = "auth-token";

// OAuth state management
const OAUTH_STATE_KEY: &str = "oauth_state";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthState {
    pub provider: String,
    pub server_url: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
    pub username: String,
    pub email: Option<String>,
}

fn get_keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_KEY)
        .map_err(|e| format!("Failed to access keyring: {}", e))
}

#[tauri::command]
pub async fn save_auth_token(_app_handle: AppHandle, token: String) -> Result<(), String> {
    log::info!("Saving auth token to keyring");

    let entry = get_keyring_entry()?;

    entry
        .set_password(&token)
        .map_err(|e| format!("Failed to save token to keyring: {}", e))?;

    log::info!("Auth token saved successfully");
    Ok(())
}

#[tauri::command]
pub async fn get_auth_token(_app_handle: AppHandle) -> Result<Option<String>, String> {
    log::debug!("Retrieving auth token from keyring");

    let entry = get_keyring_entry()?;

    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve token: {}", e)),
    }
}

#[tauri::command]
pub async fn clear_auth_token(_app_handle: AppHandle) -> Result<(), String> {
    log::info!("Clearing auth token from keyring");

    let entry = get_keyring_entry()?;

    // Delete the token - ignore error if it doesn't exist
    match entry.delete_credential() {
        Ok(_) => {
            log::info!("Auth token cleared successfully");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            log::info!("Auth token was already cleared");
            Ok(())
        }
        Err(e) => Err(format!("Failed to clear token: {}", e)),
    }
}

#[tauri::command]
pub async fn save_user_info(
    app_handle: AppHandle,
    username: String,
    email: Option<String>,
) -> Result<(), String> {
    log::info!("Saving user info for: {}", username);

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

    log::info!("User info saved successfully");
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
    log::info!("Clearing user info");

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.delete(USER_INFO_KEY);

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    log::info!("User info cleared successfully");
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
) -> Result<LoginResponse, String> {
    log::info!("Login attempt for user: {} to server: {}", username, server_url);

    // Detect if this is Supabase (SaaS) or Spring Boot (self-hosted)
    // Compare against the configured SaaS server URL from environment
    let saas_server_url = env!("VITE_SAAS_SERVER_URL");
    let is_supabase = server_url.trim_end_matches('/') == saas_server_url.trim_end_matches('/');
    log::info!("Authentication type: {}", if is_supabase { "Supabase (SaaS)" } else { "Spring Boot (Self-hosted)" });

    // Create HTTP client
    let client = reqwest::Client::new();

    if is_supabase {
        // Supabase authentication flow
        let login_url = format!("{}/auth/v1/token?grant_type=password", server_url.trim_end_matches('/'));

        // Supabase public API key from environment variable (required at compile time)
        // Set VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY before building
        let supabase_key = env!("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY");

        let request_body = serde_json::json!({
            "email": username,
            "password": password,
        });

        let response = client
            .post(&login_url)
            .header("Content-Type", "application/json;charset=UTF-8")
            .header("apikey", supabase_key)
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

        log::info!("Supabase login successful for user: {}", username);

        Ok(LoginResponse {
            token: login_response.access_token,
            username,
            email,
        })
    } else {
        // Spring Boot authentication flow
        let login_url = format!("{}/api/v1/auth/login", server_url.trim_end_matches('/'));
        log::debug!("Spring Boot login URL: {}", login_url);

        let response = client
            .post(&login_url)
            .json(&serde_json::json!({
                "username": username,
                "password": password,
            }))
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

/// Opens the system browser for OAuth authentication using deep linking
/// The OAuth callback will be received via the stirlingpdf:// protocol
/// and emitted as an 'oauth-callback' event to the frontend
#[tauri::command]
pub async fn start_oauth_login(
    _app_handle: AppHandle,
    provider: String,
    auth_server_url: String,
) -> Result<(), String> {
    log::info!("Starting OAuth login for provider: {} with auth server: {}", provider, auth_server_url);

    // Use custom URL scheme for deep linking
    // The callback will be received via the stirlingpdf:// protocol
    let callback_url = "stirlingpdf://auth/callback";

    // Build Supabase OAuth URL with deep link callback
    // Note: The Supabase project must have stirlingpdf://auth/callback configured as an allowed redirect URL
    let oauth_url = format!(
        "{}/auth/v1/authorize?provider={}&redirect_uri={}",
        auth_server_url.trim_end_matches('/'),
        provider,
        urlencoding::encode(callback_url)
    );

    log::info!("Opening OAuth URL with deep link callback: {}", oauth_url);

    // Open system browser
    if let Err(e) = tauri_plugin_opener::open_url(&oauth_url, None::<&str>) {
        log::error!("Failed to open browser: {}", e);
        return Err(format!("Failed to open browser: {}", e));
    }

    log::info!("Browser opened successfully. Waiting for OAuth callback via deep link...");

    // The callback will arrive via RunEvent::Opened in lib.rs
    // and will be emitted as an 'oauth-callback' event for the frontend to handle
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthCallbackResult {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
}

/// Parse OAuth callback URL to extract tokens
/// This is called by the frontend when it receives an oauth-callback event
#[tauri::command]
pub async fn parse_oauth_callback_url(url_str: String) -> Result<OAuthCallbackResult, String> {
    log::info!("Parsing OAuth callback URL");
    parse_oauth_callback(&url_str)
}

fn parse_oauth_callback(url_str: &str) -> Result<OAuthCallbackResult, String> {
    // Parse URL - tokens might be in query params or hash fragment
    let parsed_url = url::Url::parse(url_str)
        .map_err(|e| format!("Failed to parse callback URL: {}", e))?;

    // Check query parameters first
    let mut access_token = None;
    let mut refresh_token = None;
    let mut expires_in = None;

    for (key, value) in parsed_url.query_pairs() {
        match key.as_ref() {
            "access_token" => access_token = Some(value.to_string()),
            "refresh_token" => refresh_token = Some(value.to_string()),
            "expires_in" => expires_in = value.parse::<i64>().ok(),
            _ => {}
        }
    }

    // If not in query params, check hash fragment
    if access_token.is_none() {
        if let Some(fragment) = parsed_url.fragment() {
            for pair in fragment.split('&') {
                let mut parts = pair.split('=');
                if let (Some(key), Some(value)) = (parts.next(), parts.next()) {
                    match key {
                        "access_token" => access_token = Some(value.to_string()),
                        "refresh_token" => refresh_token = Some(value.to_string()),
                        "expires_in" => expires_in = value.parse::<i64>().ok(),
                        _ => {}
                    }
                }
            }
        }
    }

    let access_token = access_token
        .ok_or_else(|| "No access_token found in OAuth callback".to_string())?;

    Ok(OAuthCallbackResult {
        access_token,
        refresh_token,
        expires_in,
    })
}

/// Gets the stored OAuth state (for validation when callback is received)
#[tauri::command]
pub async fn get_oauth_state(app_handle: AppHandle) -> Result<Option<OAuthState>, String> {
    log::debug!("Retrieving OAuth state");

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let state: Option<OAuthState> = store
        .get(OAUTH_STATE_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    Ok(state)
}

/// Clears the OAuth state after successful/failed authentication
#[tauri::command]
pub async fn clear_oauth_state(app_handle: AppHandle) -> Result<(), String> {
    log::info!("Clearing OAuth state");

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.delete(OAUTH_STATE_KEY);

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}
