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

// Command to atomically get and clear opened file paths
#[tauri::command]
pub async fn pop_opened_files() -> Result<Vec<String>, String> {
    let mut opened_files = OPENED_FILES.lock().unwrap();
    let all_files = opened_files.clone();
    opened_files.clear();
    add_log(format!("📂 Returning and clearing {} opened file(s)", all_files.len()));
    Ok(all_files)
}

// HTML5 drops carry no paths (dragDropEnabled: false); on macOS the drag
// pasteboard still holds the dragged file URLs, so read them back.
#[tauri::command]
pub fn get_dropped_file_paths() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSPasteboard, NSPasteboardNameDrag, NSPasteboardTypeFileURL};

        let mut paths = Vec::new();
        // Extern statics; the pasteboard calls themselves are safe bindings.
        let (name, file_url_type) = unsafe { (NSPasteboardNameDrag, NSPasteboardTypeFileURL) };
        let pasteboard = NSPasteboard::pasteboardWithName(name);
        if let Some(items) = pasteboard.pasteboardItems() {
            for item in items.iter() {
                let Some(url_str) = item.stringForType(file_url_type) else {
                    continue;
                };
                let Ok(url) = url::Url::parse(&url_str.to_string()) else {
                    continue;
                };
                let Ok(path) = url.to_file_path() else {
                    continue;
                };
                // Stale pasteboard entries or vanished files must not map.
                if path.exists() {
                    if let Some(path_str) = path.to_str() {
                        paths.push(path_str.to_string());
                    }
                }
            }
        }
        add_log(format!("📂 Drag pasteboard resolved {} dropped path(s)", paths.len()));
        paths
    }
    #[cfg(not(target_os = "macos"))]
    Vec::new()
}
