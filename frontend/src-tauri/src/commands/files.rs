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
    let mut all_files: Vec<String> = Vec::new();

    // Get files from command line arguments (Windows/Linux 'Open With Stirling' behaviour)
    let args: Vec<String> = std::env::args().collect();
    let pdf_files: Vec<String> = args.iter()
        .skip(1)
        .filter(|arg| std::path::Path::new(arg).exists())
        .cloned()
        .collect();

    all_files.extend(pdf_files);

    // Add any files sent via events or other instances (macOS 'Open With Stirling' behaviour, also Windows/Linux extra files)
    {
        let opened_files = OPENED_FILES.lock().unwrap();
        all_files.extend(opened_files.clone());
    }

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

