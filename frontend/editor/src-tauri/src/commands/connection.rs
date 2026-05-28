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
pub(crate) const UPDATE_MODE_KEY: &str = "update_mode";
/// When `true` the update mode was written by a provisioning file and cannot
/// be changed from the UI. Only another provisioning file (from MDM) can
/// override it. We track this separately from `lock_connection_mode` because
/// an admin may want to lock updates without locking the connection URL,
/// or vice versa.
pub(crate) const UPDATE_MODE_LOCKED_KEY: &str = "update_mode_locked";
const PROVISIONING_FILE_NAME: &str = "stirling-provisioning.json";

/// How the desktop auto-updater should behave on startup.
///
/// * `Prompt`   – default. Show the update popup when a new version is available
///               and let the user decide whether to install.
/// * `Auto`     – silently download and install updates on startup, then restart.
///               Intended for managed deployments (Intune/MDM) where the user
///               cannot (or should not) be prompted.
/// * `Disabled` – never check for updates, never show the update UI. Administrators
///                are expected to push updates through their normal packaging flow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateMode {
    Prompt,
    Auto,
    Disabled,
}

impl Default for UpdateMode {
    fn default() -> Self {
        UpdateMode::Prompt
    }
}

/// Current update mode plus whether the UI is allowed to change it. Returned
/// by [`get_update_mode`] so the settings page can show a "managed by
/// administrator" hint instead of silently ignoring clicks.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateModeInfo {
    pub mode: UpdateMode,
    pub locked: bool,
}

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

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    // If the store is already locked, protect connection_mode, server_config, and the lock
    // flag from being overwritten by any JS-side call.
    // Only allow marking setup_completed and updating auth-related fields.
    let already_locked = store
        .get(LOCK_CONNECTION_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if already_locked {
        log::warn!("set_connection_mode called while lock_connection_mode=true — preserving connection settings, but marking setup as completed");
        // Still allow setup_completed to be written so the onboarding doesn't repeat.
        store.set(FIRST_LAUNCH_KEY, serde_json::json!(true));
        store
            .save()
            .map_err(|e| format!("Failed to save store: {}", e))?;
        return Ok(());
    }

    // Update in-memory state
    if let Ok(mut conn_state) = state.0.lock() {
        conn_state.mode = mode.clone();
        conn_state.server_config = server_config.clone();
        if let Some(lock) = lock_connection_mode {
            conn_state.lock_connection_mode = lock;
        }
    }

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
    /// Optional headless-install update policy (`"prompt"`, `"auto"`, `"disabled"`).
    /// When omitted the existing stored mode is left unchanged.
    update_mode: Option<UpdateMode>,
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

    if server_url.is_none() && parsed.update_mode.is_none() {
        add_log(
            "⚠️ Provisioning file has neither serverUrl nor updateMode; skipping apply".to_string(),
        );
        return Ok(());
    }

    let lock_flag = parsed.lock_connection_mode.unwrap_or(false);

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    // Apply server URL / connection settings only when a URL was supplied — a
    // provisioning file containing just `updateMode` should be allowed to configure
    // the headless update policy without forcing self-hosted mode.
    let server_config = if let Some(url) = server_url {
        store.set(
            CONNECTION_MODE_KEY,
            serde_json::to_value(&ConnectionMode::SelfHosted)
                .map_err(|e| format!("Failed to serialize mode: {}", e))?,
        );

        let cfg = ServerConfig { url };
        store.set(
            SERVER_CONFIG_KEY,
            serde_json::to_value(&cfg)
                .map_err(|e| format!("Failed to serialize config: {}", e))?,
        );

        store.set(
            LOCK_CONNECTION_KEY,
            serde_json::to_value(lock_flag)
                .map_err(|e| format!("Failed to serialize lock flag: {}", e))?,
        );

        store.set(FIRST_LAUNCH_KEY, serde_json::json!(true));
        Some(cfg)
    } else {
        None
    };

    if let Some(mode) = parsed.update_mode {
        store.set(
            UPDATE_MODE_KEY,
            serde_json::to_value(&mode)
                .map_err(|e| format!("Failed to serialize update mode: {}", e))?,
        );
        // A provisioning file pinning the update mode also locks the UI so
        // end users cannot flip it back — if IT wanted it to be user-editable
        // they simply wouldn't include the field in their stirling-provisioning.json.
        store.set(UPDATE_MODE_LOCKED_KEY, serde_json::json!(true));
        add_log(format!(
            "🧩 Provisioning set update mode to {:?} (locked)",
            mode
        ));
    }

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    if let (Some(cfg), Ok(mut conn_state)) =
        (server_config.as_ref(), app_handle.state::<AppConnectionState>().0.lock())
    {
        conn_state.mode = ConnectionMode::SelfHosted;
        conn_state.server_config = Some(cfg.clone());
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

/// Read the configured update mode from the tauri store.
///
/// Returns [`UpdateMode::Prompt`] when the store is unavailable or no mode
/// has been set — the prompt-the-user flow is the safe default for normal,
/// non-managed installs.
pub(crate) fn read_update_mode(app_handle: &AppHandle) -> UpdateMode {
    read_update_mode_info(app_handle).mode
}

/// Read the configured update mode AND whether it's locked by provisioning.
pub(crate) fn read_update_mode_info(app_handle: &AppHandle) -> UpdateModeInfo {
    match app_handle.store(STORE_FILE) {
        Ok(store) => {
            let mode = store
                .get(UPDATE_MODE_KEY)
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            let locked = store
                .get(UPDATE_MODE_LOCKED_KEY)
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            UpdateModeInfo { mode, locked }
        }
        Err(_) => UpdateModeInfo {
            mode: UpdateMode::default(),
            locked: false,
        },
    }
}

#[tauri::command]
pub async fn get_update_mode(app_handle: AppHandle) -> Result<UpdateModeInfo, String> {
    Ok(read_update_mode_info(&app_handle))
}

/// Update the stored update mode from the UI.
///
/// Refuses to overwrite a provisioned (locked) value so an MDM-managed
/// deployment can't be subverted by a user clicking in Settings.
#[tauri::command]
pub async fn set_update_mode(
    app_handle: AppHandle,
    mode: UpdateMode,
) -> Result<(), String> {
    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let locked = store
        .get(UPDATE_MODE_LOCKED_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if locked {
        add_log(format!(
            "⚠️ set_update_mode({:?}) rejected — mode is locked by provisioning",
            mode
        ));
        return Err("Update mode is locked by your administrator".to_string());
    }

    store.set(
        UPDATE_MODE_KEY,
        serde_json::to_value(&mode)
            .map_err(|e| format!("Failed to serialize update mode: {}", e))?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;
    add_log(format!("⚙️ User set update mode to {:?}", mode));
    Ok(())
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
