use serde::Serialize;

#[derive(Serialize)]
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

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ChooseMacosSigningIdentityResult {
    Selected {
        identity: MacosSigningIdentityResponse,
    },
    Cancelled,
    Error {
        message: String,
    },
}

#[tauri::command]
pub fn choose_macos_signing_identity() -> Result<ChooseMacosSigningIdentityResult, String> {
    Err("macOS Keychain signing is only available in the Stirling PDF macOS app".into())
}

pub fn find_keychain_helper_path(_app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    None
}
