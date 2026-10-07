use std::fs;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

struct ProvisioningFile(PathBuf);

impl ProvisioningFile {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        Self(std::env::temp_dir().join(format!(
            "stirling-provision-{}-{}.json",
            std::process::id(),
            nonce
        )))
    }

    fn run(&self, args: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_stirling-provisioner"))
            .arg("--output")
            .arg(&self.0)
            .args(args)
            .output()
            .unwrap()
    }

    fn read(&self) -> serde_json::Value {
        serde_json::from_str(&fs::read_to_string(&self.0).unwrap()).unwrap()
    }
}

impl Drop for ProvisioningFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[test]
fn update_only_install_preserves_sign_in_requirements() {
    let file = ProvisioningFile::new();
    assert!(file
        .run(&["--require-sign-in", "1", "--saas-only", "1"])
        .status
        .success());
    assert!(file
        .run(&[
            "--update-mode",
            "disabled",
            "--require-sign-in",
            "",
            "--saas-only",
            ""
        ])
        .status
        .success());
    assert_eq!(
        file.read(),
        serde_json::json!({"requireSignIn":true,"saasOnly":true,"updateMode":"disabled"})
    );
    assert!(file
        .run(&["--require-sign-in", "0", "--saas-only", "0"])
        .status
        .success());
    assert_eq!(file.read()["requireSignIn"], false);
    assert_eq!(file.read()["saasOnly"], false);
}

#[test]
fn switching_to_cloud_removes_the_old_self_hosted_target() {
    let file = ProvisioningFile::new();
    assert!(file
        .run(&["--url", "https://pdf.example.org", "--lock", "1"])
        .status
        .success());
    assert!(file
        .run(&["--require-sign-in", "1", "--saas-only", "true"])
        .status
        .success());
    assert_eq!(
        file.read(),
        serde_json::json!({"requireSignIn":true,"saasOnly":true})
    );
}

#[test]
fn conflicting_or_invalid_policies_do_not_overwrite_the_file() {
    let file = ProvisioningFile::new();
    assert!(file.run(&["--saas-only", "1"]).status.success());
    assert!(!file
        .run(&["--url", "https://pdf.example.org"])
        .status
        .success());
    assert!(!file.run(&["--require-sign-in", "invalid"]).status.success());
    assert_eq!(file.read(), serde_json::json!({"saasOnly":true}));
}

#[test]
fn privacy_policy_is_independent_preserved_and_explicitly_removable() {
    let file = ProvisioningFile::new();
    assert!(file.run(&["--local-processing-only", "1"]).status.success());
    assert_eq!(file.read(), serde_json::json!({"localProcessingOnly":true}));
    assert!(file
        .run(&["--saas-only", "1", "--local-processing-only", ""])
        .status
        .success());
    assert_eq!(
        file.read(),
        serde_json::json!({"localProcessingOnly":true,"saasOnly":true})
    );
    assert!(!file
        .run(&["--local-processing-only", "invalid"])
        .status
        .success());
    assert_eq!(file.read()["localProcessingOnly"], true);
    assert!(file.run(&["--local-processing-only", "0"]).status.success());
    assert_eq!(file.read()["localProcessingOnly"], false);
    assert_eq!(file.read()["saasOnly"], true);
}
