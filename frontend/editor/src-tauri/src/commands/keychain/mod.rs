#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(target_os = "macos"))]
mod stub;

#[cfg(not(target_os = "macos"))]
pub use stub::{choose_macos_signing_identity, find_keychain_helper_path, ChooseMacosSigningIdentityResult};

#[cfg(target_os = "macos")]
pub use macos::{choose_macos_signing_identity, find_keychain_helper_path, ChooseMacosSigningIdentityResult};
