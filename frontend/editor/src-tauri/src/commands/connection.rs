use crate::state::connection_state::{AppConnectionState, ConnectionMode, ServerConfig};
use crate::utils::{add_log, app_data_dir, system_provisioning_dir};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "connection.json";
const FIRST_LAUNCH_KEY: &str = "setup_completed";
const CONNECTION_MODE_KEY: &str = "connection_mode";
const SERVER_CONFIG_KEY: &str = "server_config";
const LOCK_CONNECTION_KEY: &str = "lock_connection_mode";
const REQUIRE_SIGN_IN_KEY: &str = "require_sign_in";
const SAAS_ONLY_KEY: &str = "saas_only";
const LOCAL_PROCESSING_ONLY_KEY: &str = "local_processing_only";
const LOGIN_AGREEMENT_KEY: &str = "login_agreement_enabled";
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
    pub require_sign_in: bool,
    pub saas_only: bool,
    pub local_processing_only: bool,
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
        require_sign_in: store
            .get(REQUIRE_SIGN_IN_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        saas_only: store
            .get(SAAS_ONLY_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        local_processing_only: store
            .get(LOCAL_PROCESSING_ONLY_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
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

    validate_managed_connection(
        store
            .get(REQUIRE_SIGN_IN_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        store
            .get(SAAS_ONLY_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        &mode,
        server_config.as_ref(),
    )?;

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
    require_sign_in: Option<bool>,
    saas_only: Option<bool>,
    local_processing_only: Option<bool>,
    login_agreement_enabled: Option<bool>,
    /// Optional headless-install update policy (`"prompt"`, `"auto"`, `"disabled"`).
    /// When omitted the existing stored mode is left unchanged.
    update_mode: Option<UpdateMode>,
}

fn provisioning_file_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Machine policy must take precedence over user-writable provisioning.
    if let Some(system_dir) = system_provisioning_dir() {
        paths.push(system_dir.join(PROVISIONING_FILE_NAME));
    }
    paths.push(app_data_dir().join(PROVISIONING_FILE_NAME));

    paths
}

/// A provisioning file should only lock the update-mode UI when it was placed
/// somewhere that requires administrator rights to write to — i.e. the
/// system-wide provisioning dir written by MSI/Intune. A file in the per-user
/// `app_data_dir()` is just a user dropping JSON in their own profile; locking
/// the UI based on that would let any local user permanently disable the
/// Settings selector for themselves with no way back, because the file is
/// deleted after apply but the lock flag persists in the store.
pub(crate) fn provisioning_path_is_admin_owned(
    provisioning_path: &std::path::Path,
    system_dir: Option<&std::path::Path>,
) -> bool {
    match system_dir {
        Some(dir) => provisioning_path.starts_with(dir),
        None => false,
    }
}

enum ProvisioningLoad {
    Ready(ProvisioningConfig),
    Quarantined { backup: PathBuf, reason: String },
}

fn load_provisioning(
    path: &std::path::Path,
    system_dir: Option<&std::path::Path>,
    stored_saas_only: bool,
) -> Result<ProvisioningLoad, String> {
    let parsed = fs::read_to_string(path)
        .map_err(|err| format!("Failed to read provisioning file: {err}"))
        .and_then(|raw| {
            serde_json::from_str::<ProvisioningConfig>(&raw)
                .map_err(|err| format!("Failed to parse provisioning file: {err}"))
        })
        .and_then(|config| {
            if config.saas_only.unwrap_or(stored_saas_only)
                && config
                    .server_url
                    .as_ref()
                    .is_some_and(|url| !url.trim().is_empty())
            {
                Err("saasOnly cannot be combined with a self-hosted serverUrl".to_string())
            } else {
                Ok(config)
            }
        });

    match parsed {
        Ok(config) => Ok(ProvisioningLoad::Ready(config)),
        Err(reason) if provisioning_path_is_admin_owned(path, system_dir) => Err(reason),
        Err(reason) => {
            let parent = path
                .parent()
                .ok_or("Provisioning file has no parent directory")?;
            let backup = tempfile::Builder::new()
                .prefix("stirling-provisioning.invalid-")
                .suffix(".json")
                .tempfile_in(parent)
                .map_err(|err| format!("{reason}; failed to create recovery copy: {err}"))?;
            fs::copy(path, backup.path())
                .map_err(|err| format!("{reason}; failed to back up provisioning: {err}"))?;
            let (_, backup) = backup
                .keep()
                .map_err(|err| format!("{reason}; failed to retain recovery copy: {err}"))?;
            fs::remove_file(path)
                .map_err(|err| format!("{reason}; failed to quarantine provisioning: {err}"))?;
            Ok(ProvisioningLoad::Quarantined { backup, reason })
        }
    }
}

/// Reapplies machine policy before startup. Invalid per-user input is backed up before any settings change; machine or persistence errors abort startup.
pub fn apply_provisioning_if_present(app_handle: &AppHandle) -> Result<(), String> {
    let provisioning_paths = provisioning_file_paths();
    let provisioning_path = provisioning_paths.into_iter().find(|path| path.exists());

    let provisioning_path = match provisioning_path {
        Some(path) => path,
        None => return Ok(()),
    };

    add_log(format!(
        "🧩 Provisioning file detected: {}",
        provisioning_path.display()
    ));

    let store = app_handle
        .store(STORE_FILE)
        .map_err(|e| format!("Failed to access store: {}", e))?;
    let stored_saas_only = store
        .get(SAAS_ONLY_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let parsed = match load_provisioning(
        &provisioning_path,
        system_provisioning_dir().as_deref(),
        stored_saas_only,
    )? {
        ProvisioningLoad::Ready(config) => config,
        ProvisioningLoad::Quarantined { backup, reason } => {
            let message = format!(
                "Your per-user provisioning file could not be applied. Existing settings have been kept.\n\n{reason}\n\nA recovery copy is saved at:\n{}\n\nCorrect that copy and save it as:\n{}\nThen restart Stirling PDF to apply it.",
                backup.display(), provisioning_path.display()
            );
            add_log(message.clone());
            app_handle
                .dialog()
                .message(message)
                .title("Stirling PDF provisioning")
                .kind(MessageDialogKind::Warning)
                .show(|_| {});
            return Ok(());
        }
    };
    let saas_only = parsed.saas_only.unwrap_or(stored_saas_only);

    // Login agreement can be provisioned independently of a server URL so it also applies to
    // local, no-login desktop installs. Persist it before the server-URL handling below, which
    // may early-return when no URL is present.
    if let Some(login_agreement_enabled) = parsed.login_agreement_enabled {
        if let Ok(store) = app_handle.store(STORE_FILE) {
            store.set(
                LOGIN_AGREEMENT_KEY,
                serde_json::json!(login_agreement_enabled),
            );
            let _ = store.save();
        }
        add_log(format!(
            "🧩 Provisioned login agreement enabled = {}",
            login_agreement_enabled
        ));
    }

    let server_url = parsed
        .server_url
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    // Only short-circuit when there is nothing left to apply. login_agreement is handled above,
    // but it must still be in this guard so a login-agreement-only file falls through to the
    // deletion block at the end (otherwise the per-user file would linger and re-apply forever).
    if server_url.is_none()
        && parsed.update_mode.is_none()
        && parsed.login_agreement_enabled.is_none()
        && parsed.require_sign_in.is_none()
        && parsed.saas_only.is_none()
        && parsed.local_processing_only.is_none()
    {
        add_log(
            "⚠️ Provisioning file has no actionable fields (serverUrl/updateMode/loginAgreement); skipping apply"
                .to_string(),
        );
        return Ok(());
    }

    let lock_flag = parsed.lock_connection_mode.unwrap_or(false);

    if let Some(required) = parsed.require_sign_in {
        store.set(REQUIRE_SIGN_IN_KEY, serde_json::json!(required));
    }
    if let Some(only) = parsed.saas_only {
        store.set(SAAS_ONLY_KEY, serde_json::json!(only));
    }
    if let Some(only) = parsed.local_processing_only {
        store.set(LOCAL_PROCESSING_ONLY_KEY, serde_json::json!(only));
    }
    if saas_only {
        let previous_mode = store
            .get(CONNECTION_MODE_KEY)
            .and_then(|value| serde_json::from_value::<ConnectionMode>(value).ok());
        if previous_mode != Some(ConnectionMode::SaaS) {
            store.delete(SERVER_CONFIG_KEY);
        }
        store.set(CONNECTION_MODE_KEY, serde_json::json!(ConnectionMode::SaaS));
        store.set(LOCK_CONNECTION_KEY, serde_json::json!(false));
    }

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
            serde_json::to_value(&cfg).map_err(|e| format!("Failed to serialize config: {}", e))?,
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
        // Only lock the UI when the provisioning file came from a path that
        // requires admin rights to write — i.e. the system provisioning dir
        // populated by MSI/Intune. A user dropping a file in their own
        // `app_data_dir` must NOT lock themselves out of the Settings
        // selector permanently (the file is deleted after apply, but the
        // lock flag persists in the store).
        let system_dir = system_provisioning_dir();
        let locked = provisioning_path_is_admin_owned(&provisioning_path, system_dir.as_deref());
        store.set(UPDATE_MODE_LOCKED_KEY, serde_json::json!(locked));
        add_log(format!(
            "🧩 Provisioning set update mode to {:?} (locked={})",
            mode, locked
        ));
    }

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    if let Ok(mut conn_state) = app_handle.state::<AppConnectionState>().0.lock() {
        if saas_only {
            conn_state.mode = ConnectionMode::SaaS;
            conn_state.server_config = store
                .get(SERVER_CONFIG_KEY)
                .and_then(|value| serde_json::from_value(value).ok());
            conn_state.lock_connection_mode = false;
        } else if let Some(cfg) = server_config {
            conn_state.mode = ConnectionMode::SelfHosted;
            conn_state.server_config = Some(cfg);
            conn_state.lock_connection_mode = lock_flag;
        }
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

fn validate_managed_connection(
    require_sign_in: bool,
    saas_only: bool,
    mode: &ConnectionMode,
    server_config: Option<&ServerConfig>,
) -> Result<(), String> {
    if saas_only && *mode == ConnectionMode::SelfHosted {
        return Err("Your administrator requires Stirling Cloud sign-in".to_string());
    }
    // Legacy renderers represent local mode as SaaS without a server.
    if require_sign_in
        && (*mode == ConnectionMode::Local
            || (*mode == ConnectionMode::SaaS && server_config.is_none()))
    {
        return Err("Your administrator requires sign-in before using this app".to_string());
    }
    Ok(())
}

/// Whether the login agreement was provisioned as enabled. Read by the backend launcher to pass
/// the `-Dlegal.loginAgreement.enabled` flag to the bundled JVM in local desktop mode.
pub fn login_agreement_enabled(app_handle: &AppHandle) -> bool {
    app_handle
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(LOGIN_AGREEMENT_KEY))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
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
pub async fn set_update_mode(app_handle: AppHandle, mode: UpdateMode) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn invalid_user_provisioning_is_preserved_for_recovery() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PROVISIONING_FILE_NAME);
        for input in [
            "{broken",
            r#"{"saasOnly":true,"serverUrl":"https://example.org"}"#,
        ] {
            fs::write(&path, input).unwrap();
            let ProvisioningLoad::Quarantined { backup, .. } =
                load_provisioning(&path, None, false).unwrap()
            else {
                panic!("invalid per-user input must be quarantined");
            };
            assert_eq!(fs::read_to_string(backup).unwrap(), input);
            assert!(!path.exists());
        }
    }

    #[test]
    fn invalid_machine_provisioning_fails_closed_without_moving_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PROVISIONING_FILE_NAME);
        for input in [
            "{broken",
            r#"{"saasOnly":true,"serverUrl":"https://example.org"}"#,
        ] {
            fs::write(&path, input).unwrap();
            assert!(load_provisioning(&path, Some(dir.path()), false).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), input);
        }
    }

    #[test]
    fn valid_provisioning_remains_available_for_application() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PROVISIONING_FILE_NAME);
        fs::write(&path, r#"{"requireSignIn":true}"#).unwrap();
        let ProvisioningLoad::Ready(config) = load_provisioning(&path, None, false).unwrap() else {
            panic!("valid provisioning must be applied");
        };
        assert_eq!(config.require_sign_in, Some(true));
        assert!(path.exists());
    }

    #[test]
    fn unrecoverable_user_provisioning_fails_closed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PROVISIONING_FILE_NAME);
        fs::create_dir(&path).unwrap();
        assert!(load_provisioning(&path, None, false).is_err());
        assert!(path.exists());
    }

    #[test]
    fn managed_sign_in_rejects_both_local_representations() {
        assert!(validate_managed_connection(true, false, &ConnectionMode::Local, None).is_err());
        assert!(validate_managed_connection(true, false, &ConnectionMode::SaaS, None).is_err());
        let server = ServerConfig {
            url: "https://example.org".into(),
        };
        assert!(
            validate_managed_connection(true, false, &ConnectionMode::SaaS, Some(&server)).is_ok()
        );
        assert!(validate_managed_connection(
            true,
            false,
            &ConnectionMode::SelfHosted,
            Some(&server)
        )
        .is_ok());
    }

    #[test]
    fn saas_only_rejects_self_hosted_but_allows_optional_guest_access() {
        let server = ServerConfig {
            url: "https://example.org".into(),
        };
        assert!(validate_managed_connection(
            false,
            true,
            &ConnectionMode::SelfHosted,
            Some(&server)
        )
        .is_err());
        assert!(validate_managed_connection(false, true, &ConnectionMode::Local, None).is_ok());
        assert!(
            validate_managed_connection(true, true, &ConnectionMode::SaaS, Some(&server)).is_ok()
        );
    }

    #[test]
    fn provisioning_accepts_sign_in_policy_without_a_server() {
        let config: ProvisioningConfig =
            serde_json::from_str(r#"{"requireSignIn":true,"saasOnly":true}"#).unwrap();
        assert_eq!(config.require_sign_in, Some(true));
        assert_eq!(config.saas_only, Some(true));
        assert!(config.server_url.is_none());
        let legacy: ProvisioningConfig = serde_json::from_str(
            r#"{"serverUrl":"https://example.org","lockConnectionMode":true}"#,
        )
        .unwrap();
        assert_eq!(legacy.lock_connection_mode, Some(true));
        assert!(legacy.require_sign_in.is_none());
        assert!(legacy.local_processing_only.is_none());
        let privacy: ProvisioningConfig =
            serde_json::from_str(r#"{"localProcessingOnly":true}"#).unwrap();
        assert_eq!(privacy.local_processing_only, Some(true));
        assert!(privacy.require_sign_in.is_none());
        assert!(
            serde_json::from_str::<ProvisioningConfig>(r#"{"localProcessingOnly":"true"}"#)
                .is_err()
        );
    }

    // Windows-path tests are cfg-gated because `Path::starts_with` is
    // component-wise: on Linux, `"C:\\foo\\bar"` is a SINGLE path component
    // (since backslash is a literal character there, not a separator) so
    // the prefix never matches the way it would on Windows.
    #[cfg(target_os = "windows")]
    #[test]
    fn user_app_data_provisioning_does_not_lock_ui() {
        // A user dropping a provisioning file in their own roaming AppData
        // (per-user, user-writable) must NOT permanently lock the update-mode
        // selector. The file is deleted after apply but the lock flag would
        // persist in the store, locking the user out with no way back.
        let user_path = PathBuf::from(
            "C:\\Users\\alice\\AppData\\Roaming\\Stirling-PDF\\stirling-provisioning.json",
        );
        let system_dir = PathBuf::from("C:\\ProgramData\\Stirling-PDF");

        assert!(!provisioning_path_is_admin_owned(
            &user_path,
            Some(&system_dir),
        ));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn system_provisioning_dir_does_lock_ui() {
        // A provisioning file in ProgramData\Stirling-PDF (or /Library, /etc)
        // requires admin/root rights to write — those locations are how MSI
        // and Intune deliver policy — so locking the UI here is correct.
        let system_path =
            PathBuf::from("C:\\ProgramData\\Stirling-PDF\\stirling-provisioning.json");
        let system_dir = PathBuf::from("C:\\ProgramData\\Stirling-PDF");

        assert!(provisioning_path_is_admin_owned(
            &system_path,
            Some(&system_dir),
        ));
    }

    #[test]
    fn linux_etc_provisioning_does_lock_ui() {
        let system_path = PathBuf::from("/etc/stirling-pdf/stirling-provisioning.json");
        let system_dir = PathBuf::from("/etc/stirling-pdf");
        assert!(provisioning_path_is_admin_owned(
            &system_path,
            Some(&system_dir),
        ));
    }

    #[test]
    fn linux_home_config_does_not_lock_ui() {
        let user_path =
            PathBuf::from("/home/alice/.config/Stirling-PDF/stirling-provisioning.json");
        let system_dir = PathBuf::from("/etc/stirling-pdf");
        assert!(!provisioning_path_is_admin_owned(
            &user_path,
            Some(&system_dir),
        ));
    }

    #[test]
    fn macos_library_provisioning_does_lock_ui() {
        let system_path =
            PathBuf::from("/Library/Application Support/Stirling-PDF/stirling-provisioning.json");
        let system_dir = PathBuf::from("/Library/Application Support/Stirling-PDF");
        assert!(provisioning_path_is_admin_owned(
            &system_path,
            Some(&system_dir),
        ));
    }

    #[test]
    fn macos_user_library_does_not_lock_ui() {
        let user_path = PathBuf::from(
            "/Users/alice/Library/Application Support/Stirling-PDF/stirling-provisioning.json",
        );
        let system_dir = PathBuf::from("/Library/Application Support/Stirling-PDF");
        assert!(!provisioning_path_is_admin_owned(
            &user_path,
            Some(&system_dir),
        ));
    }

    #[test]
    fn no_system_dir_means_no_lock() {
        // Defensive: when the platform has no defined system_provisioning_dir,
        // refuse to lock — the user-AppData file is the only thing we'd be
        // matching against, and that's the case we explicitly want to leave
        // unlocked.
        let user_path =
            PathBuf::from("/home/alice/.config/Stirling-PDF/stirling-provisioning.json");
        assert!(!provisioning_path_is_admin_owned(&user_path, None));
    }
}
