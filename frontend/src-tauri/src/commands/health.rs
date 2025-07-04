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
            println!("💓 Health check response status: {}", status);
            if status.is_success() {
                match response.text().await {
                    Ok(_body) => {
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
            println!("❌ Health check error: {}", e);
            Ok(false)
        }
    }
}