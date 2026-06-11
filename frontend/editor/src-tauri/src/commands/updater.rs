use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

use crate::commands::connection::{read_update_mode, UpdateMode};
use crate::utils::add_log;

/// Information about an available update.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// The new version string (e.g. "2.8.0").
    pub version: String,
    /// The currently installed version string.
    pub current_version: String,
    /// Release notes / changelog, if provided by the update endpoint.
    pub release_notes: Option<String>,
}

/// Progress payload emitted as `update-download-progress` events during download.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    /// Total bytes downloaded so far.
    pub downloaded: u64,
    /// Total bytes to download, if known.
    pub total: Option<u64>,
    /// Download percentage (0–100). Zero when total is unknown.
    pub percent: f64,
}

/// Check whether a newer version is available.
///
/// Returns `None` when the app is up-to-date or when the check cannot be
/// performed (e.g. no network, endpoint misconfigured).  Errors are logged
/// internally so callers do not need to surface them to the user.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    // Managed deployments may have updates disabled — never hit the endpoint in
    // that case so there's no network traffic and no way for the UI to discover
    // an update that would go unused.
    if read_update_mode(&app) == UpdateMode::Disabled {
        add_log("🔕 Update check skipped — update mode is disabled".to_string());
        return Ok(None);
    }

    add_log("🔍 Checking for updates...".to_string());

    let current_version = app.package_info().version.to_string();

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            add_log(format!("⚠️ Updater not available (plugin not configured?): {}", e));
            return Ok(None);
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            add_log(format!("✅ Update available: {} → {}", current_version, update.version));
            Ok(Some(UpdateInfo {
                version: update.version.clone(),
                current_version,
                release_notes: update.body.clone(),
            }))
        }
        Ok(None) => {
            add_log("✅ App is up to date".to_string());
            Ok(None)
        }
        Err(e) => {
            // Surface as Ok(None) so the frontend never shows a noisy error banner
            // on a transient network failure during startup.
            add_log(format!("⚠️ Update check failed: {}", e));
            Ok(None)
        }
    }
}

/// Download and install the latest available update.
///
/// Emits three events on the `AppHandle`:
/// * `update-download-progress` – [`UpdateProgress`] payload, sent for each
///   received chunk.
/// * `update-download-finished` – empty payload once the download is complete
///   and the installer has been written to disk.
/// * `update-ready-to-restart` – empty payload once the in-process install
///   step has completed and the app can be safely restarted.
///
/// Returns `Err` if the update cannot be found, downloaded, or installed so
/// the frontend can fall back to opening the download page.
#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    add_log("📥 Starting update download and install...".to_string());

    let updater = app.updater().map_err(|e| {
        let msg = format!("Updater plugin unavailable: {}", e);
        add_log(format!("⚠️ {}", msg));
        msg
    })?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update is currently available".to_string())?;

    add_log(format!("📥 Downloading version {}...", update.version));

    let downloaded = Arc::new(Mutex::new(0u64));
    let app_progress = app.clone();
    let app_finish = app.clone();

    update
        .download_and_install(
            move |chunk_length, content_length| {
                let mut dl = downloaded.lock().unwrap_or_else(|e| e.into_inner());
                *dl += chunk_length as u64;
                let current = *dl;
                let percent = content_length
                    .map(|total| (current as f64 / total as f64) * 100.0)
                    .unwrap_or(0.0);

                let _ = app_progress.emit(
                    "update-download-progress",
                    UpdateProgress {
                        downloaded: current,
                        total: content_length,
                        percent,
                    },
                );
            },
            move || {
                add_log("✅ Download finished, applying update...".to_string());
                let _ = app_finish.emit("update-download-finished", ());
            },
        )
        .await
        .map_err(|e| {
            let msg = format!("Update installation failed: {}", e);
            add_log(format!("❌ {}", msg));
            msg
        })?;

    add_log("✅ Update installed — waiting for restart".to_string());
    let _ = app.emit("update-ready-to-restart", ());

    Ok(())
}

/// Restart the application to apply an already-installed update.
///
/// This function never returns — the process is replaced by the new version.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    add_log("🔄 Restarting app to apply update...".to_string());
    app.restart();
}

/// Return the currently running application version string.
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Result of [`can_install_updates`] — does this process have the permissions
/// needed to run the Tauri updater's MSI/NSIS installer without triggering
/// UAC elevation (or another blocker)?
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CanInstallResult {
    /// `true` when the install directory is writable from the current
    /// process — the strongest signal that msiexec will succeed without
    /// needing elevation. `false` means auto-install is very likely to
    /// trigger a UAC prompt (or be blocked entirely) and should be
    /// skipped in silent/auto mode.
    pub can_install: bool,
    /// Machine-readable reason when `can_install` is `false`. One of
    /// `"install_dir_not_writable"`, `"install_dir_unknown"`. `None` when
    /// `can_install` is `true`.
    pub reason: Option<String>,
    /// Path we probed so the frontend can include it in the "contact your
    /// administrator" alert. Best-effort — may be empty on exotic layouts.
    pub install_dir: Option<String>,
}

/// Check whether the Tauri updater is likely to be able to install a new
/// version silently.
///
/// Tauri's Windows updater runs msiexec against the downloaded MSI, which on
/// a per-machine install writes to `C:\Program Files\Stirling-PDF`. If the
/// current user can write to that directory without elevation, msiexec will
/// succeed silently (passive install mode). If they can't, the install
/// triggers a UAC prompt that can't be auto-approved — and for a managed
/// (Intune/MDM) deployment the user typically can't satisfy it at all.
///
/// We test this by writing (and immediately deleting) a zero-byte probe file
/// next to the running executable. This avoids trying to reverse-engineer
/// Windows token elevation state, which is surprisingly hard to do correctly
/// on Windows when UAC filtered tokens are in play.
///
/// On macOS and Linux the probe-next-to-exe heuristic is misleading:
/// `current_exe().parent()` on macOS is `Stirling-PDF.app/Contents/MacOS/`
/// which is almost always user-writable even when `/Applications/` is not,
/// so the probe returns a false positive. On Linux the AppImage/deb install
/// story is different and not gated by this kind of check. We platform-gate
/// to Windows and report `can_install: true` elsewhere so the existing
/// interactive update flow runs unchanged.
#[tauri::command]
pub fn can_install_updates() -> CanInstallResult {
    #[cfg(not(target_os = "windows"))]
    {
        return CanInstallResult {
            can_install: true,
            reason: None,
            install_dir: None,
        };
    }

    #[cfg(target_os = "windows")]
    {
        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(e) => {
                add_log(format!("⚠️ can_install_updates: current_exe failed: {}", e));
                return CanInstallResult {
                    can_install: false,
                    reason: Some("install_dir_unknown".to_string()),
                    install_dir: None,
                };
            }
        };
        let parent = match exe.parent() {
            Some(p) => p.to_path_buf(),
            None => {
                return CanInstallResult {
                    can_install: false,
                    reason: Some("install_dir_unknown".to_string()),
                    install_dir: None,
                };
            }
        };

        let dir_display = parent.display().to_string();
        let probe = parent.join(".stirling-auto-update-probe.tmp");
        match std::fs::File::create(&probe) {
            Ok(_) => {
                let _ = std::fs::remove_file(&probe);
                add_log(format!("✅ can_install_updates: writable: {}", dir_display));
                CanInstallResult {
                    can_install: true,
                    reason: None,
                    install_dir: Some(dir_display),
                }
            }
            Err(e) => {
                add_log(format!(
                    "⚠️ can_install_updates: install dir not writable ({}): {}",
                    dir_display, e
                ));
                CanInstallResult {
                    can_install: false,
                    reason: Some("install_dir_not_writable".to_string()),
                    install_dir: Some(dir_display),
                }
            }
        }
    }
}
