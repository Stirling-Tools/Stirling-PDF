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
fn updating_legacy_policy_preserves_then_explicitly_clears_it() {
    let file = ProvisioningFile::new();
    fs::write(&file.0, r#"{"saasOnly":true,"requireSignIn":true}"#).unwrap();
    assert!(file.run(&["--update-mode", "disabled"]).status.success());
    assert_eq!(
        file.read(),
        serde_json::json!({"cloudOnly":true,"requireSignIn":true,"updateMode":"disabled"})
    );
    fs::write(&file.0, r#"{"saasOnly":true,"requireSignIn":true}"#).unwrap();
    assert!(file.run(&["--cloud-only", "0"]).status.success());
    assert_eq!(
        file.read(),
        serde_json::json!({"cloudOnly":false,"requireSignIn":true})
    );
}

#[test]
fn legacy_cli_argument_writes_the_canonical_policy_name() {
    let file = ProvisioningFile::new();
    assert!(file.run(&["--saas-only", "1"]).status.success());
    assert_eq!(file.read(), serde_json::json!({"cloudOnly":true}));
}

#[test]
fn ambiguous_policy_names_do_not_overwrite_the_file() {
    let file = ProvisioningFile::new();
    let original = r#"{"cloudOnly":false,"saasOnly":true}"#;
    fs::write(&file.0, original).unwrap();
    assert!(!file.run(&["--update-mode", "disabled"]).status.success());
    assert_eq!(fs::read_to_string(&file.0).unwrap(), original);
}

#[test]
fn update_only_install_preserves_sign_in_requirements() {
    let file = ProvisioningFile::new();
    assert!(file
        .run(&["--require-sign-in", "1", "--cloud-only", "1"])
        .status
        .success());
    assert!(file
        .run(&[
            "--update-mode",
            "disabled",
            "--require-sign-in",
            "",
            "--cloud-only",
            ""
        ])
        .status
        .success());
    assert_eq!(
        file.read(),
        serde_json::json!({"requireSignIn":true,"cloudOnly":true,"updateMode":"disabled"})
    );
    assert!(file
        .run(&["--require-sign-in", "0", "--cloud-only", "0"])
        .status
        .success());
    assert_eq!(file.read()["requireSignIn"], false);
    assert_eq!(file.read()["cloudOnly"], false);
}

#[test]
fn switching_to_cloud_removes_the_old_self_hosted_target() {
    let file = ProvisioningFile::new();
    assert!(file
        .run(&["--url", "https://pdf.example.org", "--lock", "1"])
        .status
        .success());
    assert!(file
        .run(&["--require-sign-in", "1", "--cloud-only", "true"])
        .status
        .success());
    assert_eq!(
        file.read(),
        serde_json::json!({"requireSignIn":true,"cloudOnly":true})
    );
}

#[test]
fn conflicting_or_invalid_policies_do_not_overwrite_the_file() {
    let file = ProvisioningFile::new();
    assert!(file.run(&["--cloud-only", "1"]).status.success());
    assert!(!file
        .run(&["--url", "https://pdf.example.org"])
        .status
        .success());
    assert!(!file.run(&["--require-sign-in", "invalid"]).status.success());
    assert_eq!(file.read(), serde_json::json!({"cloudOnly":true}));
}

#[test]
fn privacy_policy_is_independent_preserved_and_explicitly_removable() {
    let file = ProvisioningFile::new();
    assert!(file.run(&["--local-processing-only", "1"]).status.success());
    assert_eq!(file.read(), serde_json::json!({"localProcessingOnly":true}));
    assert!(file
        .run(&["--cloud-only", "1", "--local-processing-only", ""])
        .status
        .success());
    assert_eq!(
        file.read(),
        serde_json::json!({"localProcessingOnly":true,"cloudOnly":true})
    );
    assert!(!file
        .run(&["--local-processing-only", "invalid"])
        .status
        .success());
    assert_eq!(file.read()["localProcessingOnly"], true);
    assert!(file.run(&["--local-processing-only", "0"]).status.success());
    assert_eq!(file.read()["localProcessingOnly"], false);
    assert_eq!(file.read()["cloudOnly"], true);
}
