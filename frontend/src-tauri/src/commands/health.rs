// Command to check if backend is healthy
#[tauri::command]
pub async fn check_backend_health() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    match client.get("http://localhost:8080/api/v1/info/status").send().await {
        Ok(response) => {
            let status = response.status();
            if status.is_success() {
                match response.text().await {
                    Ok(_body) => {
                        println!("✅ Backend health check successful");
                        Ok(true)
                    }
                    Err(e) => {
                        println!("⚠️ Failed to read health response: {}", e);
                        Ok(false)
                    }
                }
            } else {
                println!("⚠️ Health check failed with status: {}", status);
                Ok(false)
            }
        }
        Err(e) => {
            // Only log connection errors if they're not the common "connection refused" during startup
            if !e.to_string().contains("connection refused") && !e.to_string().contains("No connection could be made") {
                println!("❌ Health check error: {}", e);
            }
            Ok(false)
        }
    }
}