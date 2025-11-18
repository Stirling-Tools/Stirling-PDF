use crate::state::connection_state::{AppConnectionState, ConnectionMode};
use crate::commands::backend::get_backend_port;
use tauri::State;

// Command to check if backend is healthy
#[tauri::command]
pub async fn check_backend_health(
    state: State<'_, AppConnectionState>
) -> Result<bool, String> {
    // Get connection config from state
    let (mode, server_config) = {
        let conn_state = state.0.lock()
            .map_err(|e| format!("Failed to access connection state: {}", e))?;
        (conn_state.mode.clone(), conn_state.server_config.clone())
    };

    // Determine health check URL based on connection mode
    let health_url = match mode {
        ConnectionMode::Offline => {
            // Use dynamically assigned port for bundled backend
            match get_backend_port() {
                Some(port) => format!("http://localhost:{}/api/v1/info/status", port),
                None => {
                    // Backend port not detected yet, likely still starting
                    log::debug!("Backend port not available yet");
                    return Ok(false);
                }
            }
        }
        ConnectionMode::Server => {
            match server_config {
                Some(config) => {
                    let base_url = config.url.trim_end_matches('/');
                    format!("{}/api/v1/info/status", base_url)
                }
                None => {
                    return Err("Server mode but no server URL configured".to_string());
                }
            }
        }
    };

    log::debug!("Health check URL: {}", health_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    match client.get(&health_url).send().await {
        Ok(response) => {
            let status = response.status();
            if status.is_success() {
                match response.text().await {
                    Ok(_body) => {
                        log::debug!("✅ Backend health check successful");
                        Ok(true)
                    }
                    Err(e) => {
                        log::warn!("⚠️ Failed to read health response: {}", e);
                        Ok(false)
                    }
                }
            } else {
                log::warn!("⚠️ Health check failed with status: {}", status);
                Ok(false)
            }
        }
        Err(e) => {
            // Only log connection errors if they're not the common "connection refused" during startup
            if !e.to_string().contains("connection refused") && !e.to_string().contains("No connection could be made") {
                log::error!("❌ Health check error: {}", e);
            }
            Ok(false)
        }
    }
}
