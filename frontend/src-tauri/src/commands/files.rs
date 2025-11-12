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
    // First check if we have files from macOS file open events
    {
        let opened_files = OPENED_FILES.lock().unwrap();
        if !opened_files.is_empty() {
            add_log(format!("📂 Returning {} stored opened file(s)", opened_files.len()));
            return Ok(opened_files.clone());
        }
    }

    // Fallback to command line arguments (Windows/Linux)
    let args: Vec<String> = std::env::args().collect();

    // Look for PDF file arguments (skip the first arg which is the executable)
    let pdf_files: Vec<String> = args.iter()
        .skip(1)
        .filter(|arg| arg.ends_with(".pdf") && std::path::Path::new(arg).exists())
        .cloned()
        .collect();

    if !pdf_files.is_empty() {
        add_log(format!("📂 {} PDF file(s) opened via command line", pdf_files.len()));
        return Ok(pdf_files);
    }

    Ok(Vec::new())
}

// Command to clear the opened files (after processing)
#[tauri::command]
pub async fn clear_opened_files() -> Result<(), String> {
    let mut opened_files = OPENED_FILES.lock().unwrap();
    opened_files.clear();
    add_log("📂 Cleared opened files".to_string());
    Ok(())
}

