use crate::utils::add_log;
use std::sync::Mutex;

// Store the opened file path globally
static OPENED_FILE: Mutex<Option<String>> = Mutex::new(None);

// Set the opened file path (called by macOS file open events)
pub fn set_opened_file(file_path: String) {
    let mut opened_file = OPENED_FILE.lock().unwrap();
    *opened_file = Some(file_path.clone());
    add_log(format!("📂 File opened via file open event: {}", file_path));
}

// Command to get opened file path (if app was launched with a file)
#[tauri::command]
pub async fn get_opened_file() -> Result<Option<String>, String> {
    // First check if we have a file from macOS file open events
    {
        let opened_file = OPENED_FILE.lock().unwrap();
        if let Some(ref file_path) = *opened_file {
            add_log(format!("📂 Returning stored opened file: {}", file_path));
            return Ok(Some(file_path.clone()));
        }
    }
    
    // Fallback to command line arguments (Windows/Linux)
    let args: Vec<String> = std::env::args().collect();
    
    // Look for a PDF file argument (skip the first arg which is the executable)
    for arg in args.iter().skip(1) {
        if arg.ends_with(".pdf") && std::path::Path::new(arg).exists() {
            add_log(format!("📂 PDF file opened via command line: {}", arg));
            return Ok(Some(arg.clone()));
        }
    }
    
    Ok(None)
}

// Command to clear the opened file (after processing)
#[tauri::command]
pub async fn clear_opened_file() -> Result<(), String> {
    let mut opened_file = OPENED_FILE.lock().unwrap();
    *opened_file = None;
    add_log("📂 Cleared opened file".to_string());
    Ok(())
}

