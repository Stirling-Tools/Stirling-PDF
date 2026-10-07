//! Command stubs for mobile targets (iOS / Android).
//!
//! The desktop implementations of these commands rely on a bundled JVM
//! (`backend.rs`), the updater plugin (`updater.rs`) or OS default-app
//! registration (`default_app.rs`). None of that exists on a phone, but the
//! shared frontend still invokes the commands, so they must exist and fail
//! cleanly. Mobile always talks to a remote Stirling server (SaaS or
//! self-hosted); there is no local processing backend.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::state::connection_state::AppConnectionState;
use crate::utils::add_log;

#[tauri::command]
pub async fn start_backend(
    _app: AppHandle,
    _connection_state: tauri::State<'_, AppConnectionState>,
) -> Result<String, String> {
    add_log("ℹ️ start_backend ignored: no bundled backend on mobile".to_string());
    Err("The bundled backend is not available on mobile. Connect to a server instead.".to_string())
}

#[tauri::command]
pub fn get_backend_port() -> Option<u16> {
    None
}

pub fn cleanup_backend() {}

/// Mirrors `updater::CanInstallResult` so the frontend contract is identical.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CanInstallResult {
    pub can_install: bool,
    pub reason: Option<String>,
    pub install_dir: Option<String>,
}

#[tauri::command]
pub async fn check_for_update(_app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    // App-store distribution owns updates on mobile.
    Ok(None)
}

#[tauri::command]
pub async fn download_and_install_update(_app: AppHandle) -> Result<(), String> {
    Err("In-app updates are not available on mobile. Update through the app store.".to_string())
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart()
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn can_install_updates() -> CanInstallResult {
    CanInstallResult {
        can_install: false,
        reason: Some("mobile".to_string()),
        install_dir: None,
    }
}

#[tauri::command]
pub fn is_default_pdf_handler() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
pub fn set_as_default_pdf_handler() -> Result<String, String> {
    Err("Default PDF app registration is not available on mobile.".to_string())
}
