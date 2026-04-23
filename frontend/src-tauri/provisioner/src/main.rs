use serde::Serialize;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProvisioningConfig<'a> {
    server_url: &'a str,
    lock_connection_mode: bool,
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
            _ => {
                return Err(format!("Unknown argument: {}", arg));
            }
        }
    }

    let output = output.ok_or_else(|| "Missing --output".to_string())?;
    let url = url
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Missing --url".to_string())?;
    let lock = lock_value.as_deref().map(parse_bool).unwrap_or(false);

    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    let config = ProvisioningConfig {
        server_url: url.as_str(),
        lock_connection_mode: lock,
    };

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize provisioning data: {}", e))?;

    fs::write(&output, json)
        .map_err(|e| format!("Failed to write provisioning file {}: {}", output.display(), e))?;

    Ok(())
}
