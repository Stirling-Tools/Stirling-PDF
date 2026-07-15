fn main() {
    // macOS bundles list sidecar/keychain-helper as a resource; create a stub so
    // tauri-build can validate the path before `task desktop:keychain-helper` runs.
    #[cfg(target_os = "macos")]
    ensure_keychain_helper_placeholder();

    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn ensure_keychain_helper_placeholder() {
    use std::path::Path;

    let helper = Path::new("sidecar/keychain-helper");
    if helper.is_file() {
        return;
    }
    let _ = std::fs::create_dir_all("sidecar");
    let _ = std::fs::write(
        helper,
        b"#!/bin/sh\necho 'keychain-helper not built; run task desktop:keychain-helper' >&2\nexit 1\n",
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(helper, std::fs::Permissions::from_mode(0o755));
    }
}
