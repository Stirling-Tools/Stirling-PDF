use std::sync::mpsc;

use objc2::rc::autoreleasepool;
use objc2_foundation::MainThreadMarker;
use stirling_keychain::{choose_signing_identity, ChooseIdentityResponse, IdentityInfo};
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacosSigningIdentityResponse {
    pub alias: String,
    pub source: String,
    pub subject: String,
    pub issuer: String,
    pub subject_common_name: String,
    pub issuer_common_name: String,
    pub serial_number: String,
    pub key_algorithm: String,
    pub not_before: String,
    pub not_after: String,
    pub expired: bool,
    pub not_yet_valid: bool,
}

impl From<IdentityInfo> for MacosSigningIdentityResponse {
    fn from(value: IdentityInfo) -> Self {
        Self {
            alias: value.alias,
            source: value.source,
            subject: value.subject,
            issuer: value.issuer,
            subject_common_name: value.subject_common_name,
            issuer_common_name: value.issuer_common_name,
            serial_number: value.serial_number,
            key_algorithm: value.key_algorithm,
            not_before: value.not_before,
            not_after: value.not_after,
            expired: value.expired,
            not_yet_valid: value.not_yet_valid,
        }
    }
}

#[derive(serde::Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ChooseMacosSigningIdentityResult {
    Selected { identity: MacosSigningIdentityResponse },
    Cancelled,
    Error { message: String },
}

#[tauri::command]
pub fn choose_macos_signing_identity(
    app: AppHandle,
) -> Result<ChooseMacosSigningIdentityResult, String> {
    let (sender, receiver) = mpsc::channel::<Result<ChooseMacosSigningIdentityResult, String>>();
    app.run_on_main_thread(move || {
        let result = autoreleasepool(|_| {
            if MainThreadMarker::new().is_none() {
                return Err(
                    "macOS certificate picker must run on the main thread".to_string(),
                );
            }
            match choose_signing_identity() {
                Ok(ChooseIdentityResponse::Selected { identity }) => {
                    Ok(ChooseMacosSigningIdentityResult::Selected {
                        identity: identity.into(),
                    })
                }
                Ok(ChooseIdentityResponse::Cancelled) => {
                    Ok(ChooseMacosSigningIdentityResult::Cancelled)
                }
                Ok(ChooseIdentityResponse::Error { message }) => {
                    Ok(ChooseMacosSigningIdentityResult::Error { message })
                }
                Err(err) => Err(err.to_string()),
            }
        });
        let _ = sender.send(result);
    })
    .map_err(|error| error.to_string())?;

    receiver
        .recv()
        .map_err(|error| error.to_string())?
}

pub fn find_keychain_helper_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    if let Ok(path) = std::env::var("STIRLING_KEYCHAIN_HELPER") {
        let helper = std::path::PathBuf::from(path);
        if helper.is_file() {
            return Some(helper);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        for relative in ["keychain-helper", "sidecar/keychain-helper"] {
            let helper = resource_dir.join(relative);
            if helper.is_file() {
                return Some(helper);
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let helper = dir.join("keychain-helper");
            if helper.is_file() {
                return Some(helper);
            }
        }
    }

    // Prefer the active Cargo target dir (tauri/cargo may redirect away from
    // src-tauri/target via CARGO_TARGET_DIR).
    let target_dirs = [
        std::env::var_os("CARGO_TARGET_DIR").map(std::path::PathBuf::from),
        Some(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target")),
    ];
    for target_dir in target_dirs.into_iter().flatten() {
        for profile in ["debug", "release"] {
            let candidate = target_dir.join(profile).join("keychain-helper");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    let staged = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("sidecar")
        .join("keychain-helper");
    if staged.is_file() {
        return Some(staged);
    }

    None
}
