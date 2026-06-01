use std::sync::Mutex;
use std::sync::atomic::{AtomicI8, Ordering};
use std::collections::VecDeque;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

// Store backend logs globally
static BACKEND_LOGS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

// Cap the in-memory ring buffer so chatty backend output (every JAR stdout line
// goes through add_log) doesn't grow without bound.
const MAX_IN_MEMORY_LOGS: usize = 200;

// Cached debug flag: -1 = unchecked, 0 = off, 1 = on. Avoids hitting the env on
// every add_log call (which fires per backend stdout line).
static DEBUG_FLAG: AtomicI8 = AtomicI8::new(-1);

// Console logging is enabled in dev builds, or when STIRLING_PDF_DEBUG is set
// to a truthy value (1/true/yes/on). File + in-memory logging is always on so
// support bundles still capture everything.
fn debug_logging_enabled() -> bool {
    if cfg!(debug_assertions) {
        return true;
    }
    match DEBUG_FLAG.load(Ordering::Relaxed) {
        1 => true,
        0 => false,
        _ => {
            let enabled = std::env::var("STIRLING_PDF_DEBUG")
                .map(|v| {
                    let v = v.trim().to_ascii_lowercase();
                    matches!(v.as_str(), "1" | "true" | "yes" | "on")
                })
                .unwrap_or(false);
            DEBUG_FLAG.store(if enabled { 1 } else { 0 }, Ordering::Relaxed);
            enabled
        }
    }
}

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
        if logs.len() > MAX_IN_MEMORY_LOGS {
            logs.pop_front();
        }
    }

    // Write to file
    write_to_log_file(&log_entry);

    // Only echo to console in debug builds or when STIRLING_PDF_DEBUG is set.
    // Release runs stay quiet on stdout while still capturing logs to disk.
    if debug_logging_enabled() {
        let clean_message = message.trim_end_matches('\n');
        println!("{}", clean_message);
    }
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

// Public so other modules can gate their own ad-hoc println!s on the same flag.
pub fn is_debug_logging_enabled() -> bool {
    debug_logging_enabled()
}

// Command to get logs from frontend
#[tauri::command]
pub async fn get_tauri_logs() -> Result<Vec<String>, String> {
    Ok(get_logs())
}