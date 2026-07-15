use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    // macOS bundle resources list sidecar/keychain-helper (see tauri.macos.conf.json).
    // Build and stage it here so Cargo/tauri own the Cert Sign sidecar — not Taskfile.
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_and_stage_keychain_helper();
    }

    tauri_build::build()
}

/// Builds `stirling-keychain`'s `keychain-helper` bin and copies it to `sidecar/`
/// so Tauri can bundle it for Java PDF signing (Security.framework stays out-of-process).
///
/// Uses a dedicated `--target-dir` under OUT_DIR so the nested `cargo build` does not
/// deadlock on the parent package's target lock.
fn build_and_stage_keychain_helper() {
    println!("cargo:rerun-if-changed=keychain/Cargo.toml");
    println!("cargo:rerun-if-changed=keychain/build.rs");
    println!("cargo:rerun-if-changed=keychain/src");
    println!("cargo:rerun-if-changed=keychain/native");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let cargo = env::var("CARGO").unwrap_or_else(|_| "cargo".into());

    let helper_target = out_dir.join("keychain-helper-target");

    let mut cmd = Command::new(&cargo);
    cmd.current_dir(&manifest_dir);
    cmd.args([
        "build",
        "-p",
        "stirling-keychain",
        "--bin",
        "keychain-helper",
        "--target-dir",
    ]);
    cmd.arg(&helper_target);
    if profile == "release" {
        cmd.arg("--release");
    }

    let status = cmd
        .status()
        .unwrap_or_else(|error| panic!("failed to spawn cargo for keychain-helper: {error}"));
    if !status.success() {
        panic!("failed to build keychain-helper (status {status})");
    }

    let helper_src = keychain_helper_artifact(&helper_target, &profile);
    if !helper_src.is_file() {
        panic!(
            "keychain-helper missing after build at {}",
            helper_src.display()
        );
    }

    let sidecar_dir = manifest_dir.join("sidecar");
    std::fs::create_dir_all(&sidecar_dir).unwrap_or_else(|error| {
        panic!("failed to create {}: {error}", sidecar_dir.display());
    });
    let helper_dst = sidecar_dir.join("keychain-helper");
    copy_executable(&helper_src, &helper_dst).unwrap_or_else(|error| {
        panic!(
            "failed to stage {} -> {}: {error}",
            helper_src.display(),
            helper_dst.display()
        );
    });

    // Dev / `cargo test`: Java looks next to the stirling-pdf binary and under target/.
    if let Some(dev_dst) = main_profile_helper_path(&manifest_dir, &profile) {
        if let Some(parent) = dev_dst.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = copy_executable(&helper_src, &dev_dst);
    }
}

fn keychain_helper_artifact(target_dir: &Path, profile: &str) -> PathBuf {
    let profile_dir = if profile == "release" {
        "release"
    } else {
        "debug"
    };

    let host = env::var("HOST").unwrap_or_default();
    let target = env::var("TARGET").unwrap_or_else(|_| host.clone());
    if !host.is_empty() && target != host {
        return target_dir
            .join(&target)
            .join(profile_dir)
            .join("keychain-helper");
    }
    target_dir.join(profile_dir).join("keychain-helper")
}

fn main_profile_helper_path(manifest_dir: &Path, profile: &str) -> Option<PathBuf> {
    let profile_dir = if profile == "release" {
        "release"
    } else {
        "debug"
    };
    let target_dir = env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest_dir.join("target"));

    let host = env::var("HOST").unwrap_or_default();
    let target = env::var("TARGET").unwrap_or_else(|_| host.clone());
    let dir = if !host.is_empty() && target != host {
        target_dir.join(&target).join(profile_dir)
    } else {
        target_dir.join(profile_dir)
    };
    Some(dir.join("keychain-helper"))
}

fn copy_executable(src: &Path, dst: &Path) -> std::io::Result<u64> {
    let written = std::fs::copy(src, dst)?;
    set_executable(dst);
    Ok(written)
}

fn set_executable(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(path).unwrap_or_else(|error| {
            panic!("failed to read permissions for {}: {error}", path.display());
        });
        let mut perms = metadata.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms).unwrap_or_else(|error| {
            panic!(
                "failed to set executable bit on {}: {error}",
                path.display()
            );
        });
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}
