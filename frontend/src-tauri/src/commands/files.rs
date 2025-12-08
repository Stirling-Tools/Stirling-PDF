use crate::utils::add_log;
use std::sync::Mutex;

// Store the opened file paths globally (supports multiple files)
static OPENED_FILES: Mutex<Vec<String>> = Mutex::new(Vec::new());

// Add an opened file path
pub fn add_opened_file(file_path: String) {
    let mut opened_files = OPENED_FILES.lock().unwrap();
    opened_files.push(file_path.clone());
    add_log(format!("📂 File stored for later retrieval: {}", file_path));
}

// Command to get opened file paths (if app was launched with files)
#[tauri::command]
pub async fn get_opened_files() -> Result<Vec<String>, String> {
    // Get all files from the OPENED_FILES store
    // Command line args are processed in setup() callback and added to this store
    // Additional files from second instances or events are also added here
    let opened_files = OPENED_FILES.lock().unwrap();
    let all_files = opened_files.clone();

    add_log(format!("📂 Returning {} opened file(s)", all_files.len()));
    Ok(all_files)
}

// Command to clear the opened files (after processing)
#[tauri::command]
pub async fn clear_opened_files() -> Result<(), String> {
    let mut opened_files = OPENED_FILES.lock().unwrap();
    opened_files.clear();
    add_log("📂 Cleared opened files".to_string());
    Ok(())
}

