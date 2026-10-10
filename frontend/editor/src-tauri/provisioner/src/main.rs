use serde::Serialize;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProvisioningConfig<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    server_url: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lock_connection_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    require_sign_in: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cloud_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    local_processing_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    login_agreement_enabled: Option<bool>,
    /// Optional headless-install update policy.
    /// One of `"prompt"` (default), `"auto"`, or `"disabled"`.
    #[serde(skip_serializing_if = "Option::is_none")]
    update_mode: Option<&'a str>,
}

fn parse_bool(value: &str) -> bool {
    matches!(
        value.trim().to_lowercase().as_str(),
        "1" | "true" | "yes" | "y"
    )
}

fn parse_policy_bool(value: Option<&str>) -> Result<Option<bool>, String> {
    match value.unwrap_or("").trim().to_lowercase().as_str() {
        "" => Ok(None),
        "1" | "true" | "yes" | "y" => Ok(Some(true)),
        "0" | "false" | "no" | "n" => Ok(Some(false)),
        other => Err(format!(
            "Invalid policy boolean '{}': expected true or false",
            other
        )),
    }
}

/// Normalise the `--update-mode` argument into the lowercase tokens the app
/// understands. Empty / whitespace values are treated as "not supplied" so
/// MSI installs that don't pass STIRLING_UPDATE_MODE behave identically to
/// earlier builds.
fn parse_update_mode(value: &str) -> Result<Option<&'static str>, String> {
    match value.trim().to_lowercase().as_str() {
        "" => Ok(None),
        "prompt" => Ok(Some("prompt")),
        "auto" => Ok(Some("auto")),
        "disabled" | "off" | "none" => Ok(Some("disabled")),
        other => Err(format!(
            "Invalid --update-mode value '{}': expected prompt, auto, or disabled",
            other
        )),
    }
}

fn main() -> Result<(), String> {
    let mut output: Option<PathBuf> = None;
    let mut url: Option<String> = None;
    let mut lock_value: Option<String> = None;
    let mut require_sign_in_arg: Option<String> = None;
    let mut cloud_only_arg: Option<String> = None;
    let mut local_processing_only_arg: Option<String> = None;
    let mut login_agreement_value: Option<String> = None;
    let mut update_mode_arg: Option<String> = None;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--output" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--output requires a value".to_string())?;
                output = Some(PathBuf::from(value));
            }
            "--url" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--url requires a value".to_string())?;
                url = Some(value);
            }
            "--lock" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--lock requires a value".to_string())?;
                lock_value = Some(value);
            }
            "--require-sign-in" => {
                require_sign_in_arg =
                    Some(args.next().ok_or("--require-sign-in requires a value")?);
            }
            "--cloud-only" | "--saas-only" => {
                cloud_only_arg = Some(args.next().ok_or("--cloud-only requires a value")?);
            }
            "--local-processing-only" => {
                local_processing_only_arg = Some(
                    args.next()
                        .ok_or("--local-processing-only requires a value")?,
                );
            }
            "--login-agreement" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--login-agreement requires a value".to_string())?;
                login_agreement_value = Some(value);
            }
            "--update-mode" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--update-mode requires a value".to_string())?;
                update_mode_arg = Some(value);
            }
            _ => {
                return Err(format!("Unknown argument: {}", arg));
            }
        }
    }

    let output = output.ok_or_else(|| "Missing --output".to_string())?;

    let url = url
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    // Treat an empty/whitespace value as "not supplied" (None), matching url and
    // update-mode. The MSI always passes --login-agreement "[STIRLING_LOGIN_AGREEMENT]",
    // which expands to "" when the property is unset; that must NOT write
    // loginAgreementEnabled:false and clobber a previously-provisioned true.
    let login_agreement = login_agreement_value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(parse_bool);

    let update_mode = update_mode_arg
        .as_deref()
        .map(parse_update_mode)
        .transpose()?
        .flatten();

    let require_sign_in = parse_policy_bool(require_sign_in_arg.as_deref())?;
    let cloud_only = parse_policy_bool(cloud_only_arg.as_deref())?;
    let local_processing_only = parse_policy_bool(local_processing_only_arg.as_deref())?;

    // Nothing to write — avoid clobbering an existing provisioning file when the
    // MSI is invoked without any provisioning directives
    // (STIRLING_SERVER_URL / STIRLING_LOGIN_AGREEMENT / STIRLING_UPDATE_MODE).
    if url.is_none()
        && login_agreement.is_none()
        && update_mode.is_none()
        && require_sign_in.is_none()
        && cloud_only.is_none()
        && local_processing_only.is_none()
    {
        return Ok(());
    }

    let lock = if url.is_some() {
        Some(lock_value.as_deref().map(parse_bool).unwrap_or(false))
    } else {
        None
    };

    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    let config = ProvisioningConfig {
        server_url: url.as_deref(),
        lock_connection_mode: lock,
        require_sign_in,
        cloud_only,
        local_processing_only,
        login_agreement_enabled: login_agreement,
        update_mode,
    };

    let mut merged = if output.exists() {
        let raw = fs::read_to_string(&output).map_err(|e| e.to_string())?;
        serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&raw)
            .map_err(|e| {
                format!(
                    "Cannot merge existing provisioning file {}: {e}. Back up this file and replace it with the complete intended policy, then retry the installation. Existing policy data has not been changed.",
                    output.display()
                )
            })?
    } else {
        serde_json::Map::new()
    };
    if let Some(legacy) = merged.remove("saasOnly") {
        if merged.contains_key("cloudOnly") {
            return Err(
                "Use only cloudOnly in provisioning data, not both policy names".to_string(),
            );
        }
        merged.insert("cloudOnly".to_string(), legacy);
    }
    let serde_json::Value::Object(updates) =
        serde_json::to_value(&config).map_err(|e| e.to_string())?
    else {
        return Err("Provisioning data must be an object".to_string());
    };
    merged.extend(updates);
    if merged.get("cloudOnly").and_then(|v| v.as_bool()) == Some(true) {
        if url.is_some() {
            return Err("cloudOnly cannot be combined with a self-hosted serverUrl".to_string());
        }
        merged.remove("serverUrl");
        merged.remove("lockConnectionMode");
    }
    let json = serde_json::to_string_pretty(&merged)
        .map_err(|e| format!("Failed to serialize provisioning data: {}", e))?;

    fs::write(&output, json).map_err(|e| {
        format!(
            "Failed to write provisioning file {}: {}",
            output.display(),
            e
        )
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_booleans_distinguish_omission_from_disabling() {
        assert_eq!(parse_policy_bool(None).unwrap(), None);
        assert_eq!(parse_policy_bool(Some(" ")).unwrap(), None);
        assert_eq!(parse_policy_bool(Some("1")).unwrap(), Some(true));
        assert_eq!(parse_policy_bool(Some("TRUE")).unwrap(), Some(true));
        assert_eq!(parse_policy_bool(Some("false")).unwrap(), Some(false));
        assert_eq!(parse_policy_bool(Some("0")).unwrap(), Some(false));
        assert!(parse_policy_bool(Some("treu")).is_err());
    }

    #[test]
    fn policy_only_config_needs_no_server_url() {
        let config = ProvisioningConfig {
            server_url: None,
            lock_connection_mode: None,
            require_sign_in: Some(true),
            cloud_only: Some(true),
            local_processing_only: Some(true),
            login_agreement_enabled: None,
            update_mode: None,
        };
        assert_eq!(
            serde_json::to_value(config).unwrap(),
            serde_json::json!({"requireSignIn": true, "cloudOnly": true, "localProcessingOnly": true})
        );
    }
}
