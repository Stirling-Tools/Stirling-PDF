use crate::state::connection_state::{
    AppConnectionState,
    ConnectionMode,
    ServerConfig,
};
use crate::utils::{add_log, app_data_dir, system_provisioning_dir};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "connection.json";
const FIRST_LAUNCH_KEY: &str = "setup_completed";
const CONNECTION_MODE_KEY: &str = "connection_mode";
const SERVER_CONFIG_KEY: &str = "server_config";
const LOCK_CONNECTION_KEY: &str = "lock_connection_mode";
const PROVISIONING_FILE_NAME: &str = "stirling-provisioning.json";

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub mode: ConnectionMode,
    pub server_config: Option<ServerConfig>,
    pub lock_connection_mode: bool,
}

#[tauri::command]
pub async fn get_connection_config(
    app_handle: AppHandle,
    state: State<'_, AppConnectionState>,
) -> Result<ConnectionConfig, String> {
    // Try to load from store
    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let mode = store
        .get(CONNECTION_MODE_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or(ConnectionMode::SaaS);

    let server_config: Option<ServerConfig> = store
        .get(SERVER_CONFIG_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let lock_connection_mode = store
        .get(LOCK_CONNECTION_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Update in-memory state
    if let Ok(mut conn_state) = state.0.lock() {
        conn_state.mode = mode.clone();
        conn_state.server_config = server_config.clone();
        conn_state.lock_connection_mode = lock_connection_mode;
    }

    Ok(ConnectionConfig {
        mode,
        server_config,
        lock_connection_mode,
    })
}

#[tauri::command]
pub async fn set_connection_mode(
    app_handle: AppHandle,
    state: State<'_, AppConnectionState>,
    mode: ConnectionMode,
    server_config: Option<ServerConfig>,
    lock_connection_mode: Option<bool>,
) -> Result<(), String> {
    log::info!("Setting connection mode: {:?}", mode);

    // Update in-memory state
    if let Ok(mut conn_state) = state.0.lock() {
        conn_state.mode = mode.clone();
        conn_state.server_config = server_config.clone();
        if let Some(lock) = lock_connection_mode {
            conn_state.lock_connection_mode = lock;
        }
    }

    // Save to store
    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.set(
        CONNECTION_MODE_KEY,
        serde_json::to_value(&mode).map_err(|e| format!("Failed to serialize mode: {}", e))?,
    );

    if let Some(config) = &server_config {
        store.set(
            SERVER_CONFIG_KEY,
            serde_json::to_value(config)
                .map_err(|e| format!("Failed to serialize config: {}", e))?,
        );
    } else {
        store.delete(SERVER_CONFIG_KEY);
    }

    if let Some(lock) = lock_connection_mode {
        store.set(
            LOCK_CONNECTION_KEY,
            serde_json::to_value(lock)
                .map_err(|e| format!("Failed to serialize lock flag: {}", e))?,
        );
    }

    // Mark setup as completed
    store.set(FIRST_LAUNCH_KEY, serde_json::json!(true));

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    log::info!("Connection mode saved successfully");
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisioningConfig {
    server_url: Option<String>,
    lock_connection_mode: Option<bool>,
}

fn provisioning_file_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    paths.push(app_data_dir().join(PROVISIONING_FILE_NAME));

    if let Some(system_dir) = system_provisioning_dir() {
        paths.push(system_dir.join(PROVISIONING_FILE_NAME));
    }

    paths
}

pub fn apply_provisioning_if_present(app_handle: &AppHandle) -> Result<(), String> {
    let provisioning_paths = provisioning_file_paths();
    let provisioning_path = provisioning_paths
        .into_iter()
        .find(|path| path.exists());

    let provisioning_path = match provisioning_path {
        Some(path) => path,
        None => return Ok(()),
    };

    add_log(format!(
        "🧩 Provisioning file detected: {}",
        provisioning_path.display()
    ));

    let raw = fs::read_to_string(&provisioning_path)
        .map_err(|e| format!("Failed to read provisioning file: {}", e))?;
    let parsed: ProvisioningConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse provisioning file: {}", e))?;

    let server_url = parsed
        .server_url
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if server_url.is_none() {
        add_log("⚠️ Provisioning file missing serverUrl; skipping apply".to_string());
        return Ok(());
    }

    let lock_flag = parsed.lock_connection_mode.unwrap_or(false);

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.set(
        CONNECTION_MODE_KEY,
        serde_json::to_value(&ConnectionMode::SelfHosted)
            .map_err(|e| format!("Failed to serialize mode: {}", e))?,
    );

    let server_config = ServerConfig {
        url: server_url.clone().unwrap(),
    };
    store.set(
        SERVER_CONFIG_KEY,
        serde_json::to_value(&server_config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?,
    );

    store.set(
        LOCK_CONNECTION_KEY,
        serde_json::to_value(lock_flag)
            .map_err(|e| format!("Failed to serialize lock flag: {}", e))?,
    );

    store.set(FIRST_LAUNCH_KEY, serde_json::json!(true));

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    if let Ok(mut conn_state) = app_handle.state::<AppConnectionState>().0.lock() {
        conn_state.mode = ConnectionMode::SelfHosted;
        conn_state.server_config = Some(server_config);
        conn_state.lock_connection_mode = lock_flag;
    }

    let user_app_data = app_data_dir();
    if provisioning_path.starts_with(&user_app_data) {
        match fs::remove_file(&provisioning_path) {
            Ok(_) => add_log("✅ Provisioning file applied and removed".to_string()),
            Err(err) => add_log(format!(
                "⚠️ Provisioning applied but failed to remove file: {}",
                err
            )),
        }
    } else {
        add_log("ℹ️ Provisioning applied from system location; leaving file in place".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn is_first_launch(app_handle: AppHandle) -> Result<bool, String> {
    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let setup_completed = store
        .get(FIRST_LAUNCH_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(!setup_completed)
}

#[tauri::command]
pub async fn reset_setup_completion(app_handle: AppHandle) -> Result<(), String> {
    log::info!("Resetting setup completion flag");

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    // Reset setup completion flag to force SetupWizard on next launch
    store.set(FIRST_LAUNCH_KEY, serde_json::json!(false));

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    log::info!("Setup completion flag reset successfully");
    Ok(())
}
