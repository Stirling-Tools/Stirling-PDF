use crate::state::connection_state::{
    AppConnectionState,
    ConnectionMode,
    ServerConfig,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "connection.json";
const FIRST_LAUNCH_KEY: &str = "setup_completed";
const CONNECTION_MODE_KEY: &str = "connection_mode";
const SERVER_CONFIG_KEY: &str = "server_config";

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub mode: ConnectionMode,
    pub server_config: Option<ServerConfig>,
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

    // Update in-memory state
    if let Ok(mut conn_state) = state.0.lock() {
        conn_state.mode = mode.clone();
        conn_state.server_config = server_config.clone();
    }

    Ok(ConnectionConfig {
        mode,
        server_config,
    })
}

#[tauri::command]
pub async fn set_connection_mode(
    app_handle: AppHandle,
    state: State<'_, AppConnectionState>,
    mode: ConnectionMode,
    server_config: Option<ServerConfig>,
) -> Result<(), String> {
    log::info!("Setting connection mode: {:?}", mode);

    // Update in-memory state
    if let Ok(mut conn_state) = state.0.lock() {
        conn_state.mode = mode.clone();
        conn_state.server_config = server_config.clone();
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

    // Mark setup as completed
    store.set(FIRST_LAUNCH_KEY, serde_json::json!(true));

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    log::info!("Connection mode saved successfully");
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
