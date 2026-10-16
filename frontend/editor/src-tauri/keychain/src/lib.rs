#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(target_os = "macos"))]
mod stub;

#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
pub use stub::*;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityInfo {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum ChooseIdentityResponse {
    #[serde(rename = "selected")]
    Selected { identity: IdentityInfo },
    #[serde(rename = "cancelled")]
    Cancelled,
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateChainResponse {
    pub certificates_der_base64: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum KeychainError {
    #[error("{0}")]
    Message(String),
}

pub type Result<T> = std::result::Result<T, KeychainError>;
