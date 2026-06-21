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
    login_agreement_enabled: Option<bool>,
}

fn parse_bool(value: &str) -> bool {
    match value.trim().to_lowercase().as_str() {
        "1" | "true" | "yes" | "y" => true,
        _ => false,
    }
}

fn main() -> Result<(), String> {
    let mut output: Option<PathBuf> = None;
    let mut url: Option<String> = None;
    let mut lock_value: Option<String> = None;
    let mut login_agreement_value: Option<String> = None;

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
            "--login-agreement" => {
                let value = args
                    .next()
                    .ok_or_else(|| "--login-agreement requires a value".to_string())?;
                login_agreement_value = Some(value);
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
    let login_agreement = login_agreement_value.as_deref().map(parse_bool);
    let lock = lock_value.as_deref().map(parse_bool);

    // Need at least a server URL or a login-agreement directive to have something to write.
    if url.is_none() && login_agreement.is_none() {
        return Err("Provide at least --url or --login-agreement".to_string());
    }

    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    let config = ProvisioningConfig {
        server_url: url.as_deref(),
        lock_connection_mode: if url.is_some() {
            Some(lock.unwrap_or(false))
        } else {
            lock
        },
        login_agreement_enabled: login_agreement,
    };

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize provisioning data: {}", e))?;

    fs::write(&output, json)
        .map_err(|e| format!("Failed to write provisioning file {}: {}", output.display(), e))?;

    Ok(())
}
