use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

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

// Response types for Spring Boot login
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

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub username: String,
    pub email: Option<String>,
}

/// Login command - makes HTTP request from Rust to bypass CORS
/// Supports Spring Boot authentication (self-hosted)
#[tauri::command]
pub async fn login(
    server_url: String,
    username: String,
    password: String,
) -> Result<LoginResponse, String> {
    log::info!("Login attempt for user: {} to server: {}", username, server_url);

    // Build login URL
    let login_url = format!("{}/api/v1/auth/login", server_url.trim_end_matches('/'));
    log::debug!("Login URL: {}", login_url);

    // Create HTTP client
    let client = reqwest::Client::new();

    // Make login request
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
    log::debug!("Login response status: {}", status);

    if !status.is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        log::error!("Login failed with status {}: {}", status, error_text);

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
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    log::info!("Login successful for user: {}", login_response.user.username);

    Ok(LoginResponse {
        token: login_response.session.access_token,
        username: login_response.user.username,
        email: login_response.user.email,
    })
}
