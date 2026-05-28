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

    let update_mode = update_mode_arg
        .as_deref()
        .map(parse_update_mode)
        .transpose()?
        .flatten();

    // Nothing to write — avoid clobbering an existing provisioning file when
    // the MSI is invoked without any of STIRLING_SERVER_URL / STIRLING_UPDATE_MODE.
    if url.is_none() && update_mode.is_none() {
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
        update_mode,
    };

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize provisioning data: {}", e))?;

    fs::write(&output, json)
        .map_err(|e| format!("Failed to write provisioning file {}: {}", output.display(), e))?;

    Ok(())
}
