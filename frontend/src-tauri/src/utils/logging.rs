use std::sync::Mutex;
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

// Store backend logs globally
static BACKEND_LOGS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

// Get platform-specific log directory
fn get_log_directory() -> PathBuf {
    if cfg!(target_os = "macos") {
        // macOS: ~/Library/Logs/Stirling-PDF
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join("Library").join("Logs").join("Stirling-PDF")
    } else if cfg!(target_os = "windows") {
        // Windows: %APPDATA%\Stirling-PDF\logs
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
        PathBuf::from(appdata).join("Stirling-PDF").join("logs")
    } else {
        // Linux: ~/.config/Stirling-PDF/logs
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join(".config").join("Stirling-PDF").join("logs")
    }
}

// Helper function to add log entry
pub fn add_log(message: String) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let log_entry = format!("{}: {}", timestamp, message);
    
    // Add to memory logs
    {
        let mut logs = BACKEND_LOGS.lock().unwrap();
        logs.push_back(log_entry.clone());
        // Keep only last 100 log entries
        if logs.len() > 100 {
            logs.pop_front();
        }
    }
    
    // Write to file
    write_to_log_file(&log_entry);
    
    // Remove trailing newline if present
    let clean_message = message.trim_end_matches('\n').to_string();
    println!("{}", clean_message); // Also print to console
}

// Write log entry to file
fn write_to_log_file(log_entry: &str) {
    let log_dir = get_log_directory();
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        eprintln!("Failed to create log directory: {}", e);
        return;
    }
    
    let log_file = log_dir.join("tauri-backend.log");
    
    match OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        Ok(mut file) => {
            if let Err(e) = writeln!(file, "{}", log_entry) {
                eprintln!("Failed to write to log file: {}", e);
            }
        }
        Err(e) => {
            eprintln!("Failed to open log file {:?}: {}", log_file, e);
        }
    }
}

// Get current logs for debugging
pub fn get_logs() -> Vec<String> {
    let logs = BACKEND_LOGS.lock().unwrap();
    logs.iter().cloned().collect()
}

// Command to get logs from frontend
#[tauri::command]
pub async fn get_tauri_logs() -> Result<Vec<String>, String> {
    Ok(get_logs())
}

// Get log file path for external access
pub fn get_log_file_path() -> PathBuf {
    get_log_directory().join("tauri-backend.log")
}
