use reqwest;

#[tauri::command]
pub async fn check_backend_health(port: u16) -> Result<bool, String> {
    let url = format!("http://localhost:{}/api/v1/info/status", port);

    match reqwest::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false), // Return false instead of error for connection failures
    }
}
