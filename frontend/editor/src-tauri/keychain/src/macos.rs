use security_framework::certificate::SecCertificate;
use security_framework::identity::SecIdentity;
use security_framework::item::{ItemClass, ItemSearchOptions, Limit, Reference, SearchResult};
use security_framework::key::Algorithm;
use sha2::{Digest, Sha256};

use crate::{ChooseIdentityResponse, IdentityInfo, KeychainError, Result};

#[repr(C)]
struct MacIdentityResult {
    identity_hash: *mut std::os::raw::c_char,
    subject: *mut std::os::raw::c_char,
    issuer: *mut std::os::raw::c_char,
    subject_common_name: *mut std::os::raw::c_char,
    issuer_common_name: *mut std::os::raw::c_char,
    serial_number: *mut std::os::raw::c_char,
    key_algorithm: *mut std::os::raw::c_char,
    not_before: *mut std::os::raw::c_char,
    not_after: *mut std::os::raw::c_char,
    expired: std::os::raw::c_int,
    not_yet_valid: std::os::raw::c_int,
    cancelled: std::os::raw::c_int,
    error: std::os::raw::c_int,
    error_message: *mut std::os::raw::c_char,
}

extern "C" {
    fn mac_choose_signing_identity() -> MacIdentityResult;
    fn mac_identity_result_free(result: *mut MacIdentityResult);
}

fn normalize_hash(value: &str) -> String {
    value.replace(' ', "").to_uppercase()
}

/// SHA-256 of the certificate DER — must match the ObjC picker (`picker.m`).
pub fn certificate_sha256_hex(certificate: &SecCertificate) -> Result<String> {
    let der = certificate.to_der();
    let digest = Sha256::digest(&der);
    Ok(digest.iter().map(|byte| format!("{byte:02X}")).collect())
}

fn read_c_string(value: *mut std::os::raw::c_char) -> String {
    if value.is_null() {
        return String::new();
    }
    unsafe { std::ffi::CStr::from_ptr(value).to_string_lossy().into_owned() }
}

/// Shows the native macOS identity picker and returns the selected cert SHA-256 hash.
pub fn choose_signing_identity() -> Result<ChooseIdentityResponse> {
    let raw = unsafe { mac_choose_signing_identity() };
    if raw.cancelled != 0 {
        unsafe { mac_identity_result_free(&raw as *const _ as *mut _) };
        return Ok(ChooseIdentityResponse::Cancelled);
    }
    if raw.error != 0 {
        let message = read_c_string(raw.error_message);
        unsafe { mac_identity_result_free(&raw as *const _ as *mut _) };
        return Ok(ChooseIdentityResponse::Error { message });
    }

    let subject = read_c_string(raw.subject);
    let issuer = read_c_string(raw.issuer);
    let identity = IdentityInfo {
        alias: read_c_string(raw.identity_hash),
        source: "MACOS_KEYCHAIN".to_string(),
        subject: subject.clone(),
        issuer: issuer.clone(),
        subject_common_name: read_c_string(raw.subject_common_name),
        issuer_common_name: read_c_string(raw.issuer_common_name),
        serial_number: read_c_string(raw.serial_number),
        key_algorithm: read_c_string(raw.key_algorithm),
        not_before: read_c_string(raw.not_before),
        not_after: read_c_string(raw.not_after),
        expired: raw.expired != 0,
        not_yet_valid: raw.not_yet_valid != 0,
    };
    unsafe { mac_identity_result_free(&raw as *const _ as *mut _) };
    Ok(ChooseIdentityResponse::Selected { identity })
}

fn find_identity_by_hash(target_hash: &str) -> Result<SecIdentity> {
    let normalized = normalize_hash(target_hash);
    // Limit defaults to 1; without Limit::All only the first identity is considered.
    let results = ItemSearchOptions::new()
        .class(ItemClass::identity())
        .load_refs(true)
        .limit(Limit::All)
        .search()
        .map_err(|err| {
            KeychainError::Message(format!("Could not search keychain identities: {err}"))
        })?;

    for result in results {
        let identity = match result {
            SearchResult::Ref(Reference::Identity(identity)) => identity,
            _ => continue,
        };
        let certificate = match identity.certificate() {
            Ok(certificate) => certificate,
            Err(_) => continue,
        };
        if certificate_sha256_hex(&certificate)? == normalized {
            return Ok(identity);
        }
    }

    Err(KeychainError::Message(format!(
        "No keychain identity found for hash {normalized}"
    )))
}

pub fn get_certificate_chain(identity_hash: &str) -> Result<Vec<Vec<u8>>> {
    let identity = find_identity_by_hash(identity_hash)?;
    let leaf = identity
        .certificate()
        .map_err(|err| KeychainError::Message(err.to_string()))?
        .to_der();
    Ok(vec![leaf])
}

fn map_algorithm(algorithm: &str) -> Algorithm {
    let upper = algorithm.to_uppercase();
    if upper.contains("ECDSA") || upper.contains("EC") {
        Algorithm::ECDSASignatureMessageX962SHA256
    } else {
        Algorithm::RSASignatureMessagePKCS1v15SHA256
    }
}

pub fn sign_message(identity_hash: &str, algorithm: &str, message: &[u8]) -> Result<Vec<u8>> {
    let identity = find_identity_by_hash(identity_hash)?;
    let private_key = identity
        .private_key()
        .map_err(|err| KeychainError::Message(format!("Could not access private key: {err}")))?;

    private_key
        .create_signature(map_algorithm(algorithm), message)
        .map_err(|err| KeychainError::Message(format!("Keychain signing failed: {err}")))
}
