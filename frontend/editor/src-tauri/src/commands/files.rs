use crate::utils::add_log;
use std::sync::Mutex;
use tauri_plugin_opener::OpenerExt;

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

// Command to atomically get and clear opened file paths
#[tauri::command]
pub async fn pop_opened_files() -> Result<Vec<String>, String> {
    let mut opened_files = OPENED_FILES.lock().unwrap();
    let all_files = opened_files.clone();
    opened_files.clear();
    add_log(format!("📂 Returning and clearing {} opened file(s)", all_files.len()));
    Ok(all_files)
}

// Report whether a path still exists on disk (used to prune stale recent files).
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

// Reveal a file in the OS file manager (Explorer/Finder), highlighting it.
#[tauri::command]
pub async fn reveal_in_file_manager(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn path_exists_tracks_real_disk_state() {
        let file = std::env::temp_dir()
            .join(format!("stirling_path_exists_{}.tmp", std::process::id()));
        let path = file.to_string_lossy().to_string();

        // Absent before creation.
        assert!(!path_exists(path.clone()));

        // Present once written.
        writeln!(std::fs::File::create(&file).unwrap(), "x").unwrap();
        assert!(path_exists(path.clone()));

        // Gone again after deletion (the case that prunes a recent).
        std::fs::remove_file(&file).unwrap();
        assert!(!path_exists(path));
    }
}
