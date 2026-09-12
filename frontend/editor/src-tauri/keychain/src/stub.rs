use stirling_keychain::{ChooseIdentityResponse, KeychainError, Result};

pub fn choose_signing_identity() -> Result<ChooseIdentityResponse> {
    Err(KeychainError::Message(
        "macOS Keychain signing is only available in the Stirling PDF macOS app".into(),
    ))
}

pub fn get_certificate_chain(_identity_hash: &str) -> Result<Vec<Vec<u8>>> {
    Err(KeychainError::Message(
        "macOS Keychain signing is only available in the Stirling PDF macOS app".into(),
    ))
}

pub fn sign_message(_identity_hash: &str, _algorithm: &str, _message: &[u8]) -> Result<Vec<u8>> {
    Err(KeychainError::Message(
        "macOS Keychain signing is only available in the Stirling PDF macOS app".into(),
    ))
}
