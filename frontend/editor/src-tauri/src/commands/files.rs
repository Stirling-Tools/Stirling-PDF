use crate::utils::add_log;
use serde::Serialize;
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

// On-disk state of a linked file. Desktop files are meant to stay 1:1 with disk,
// so the frontend stats the real file rather than trusting its IndexedDB copy.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskFileState {
    pub exists: bool,
    pub size: u64,
    // Epoch ms; 0 when the platform gives us no mtime.
    pub modified_ms: u64,
}

impl DiskFileState {
    fn missing() -> Self {
        Self { exists: false, size: 0, modified_ms: 0 }
    }
}

// Stat a linked file. A directory at the path counts as missing, not as a file.
#[tauri::command]
pub fn file_disk_state(path: String) -> DiskFileState {
    match std::fs::metadata(&path) {
        Ok(meta) if meta.is_file() => DiskFileState {
            exists: true,
            size: meta.len(),
            modified_ms: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        },
        _ => DiskFileState::missing(),
    }
}

// Report whether a path still exists on disk (used to prune stale recent files).
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    file_disk_state(path).exists
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_path(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("stirling_{}_{}.tmp", tag, std::process::id()))
    }

    #[test]
    fn path_exists_tracks_real_disk_state() {
        let file = temp_path("path_exists");
        let path = file.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&file);

        // Absent before creation.
        assert!(!path_exists(path.clone()));

        // Present once written.
        writeln!(std::fs::File::create(&file).unwrap(), "x").unwrap();
        assert!(path_exists(path.clone()));

        // Gone again after deletion (the case that prunes a recent).
        std::fs::remove_file(&file).unwrap();
        assert!(!path_exists(path));
    }

    #[test]
    fn disk_state_reports_size_and_mtime_for_a_real_file() {
        let file = temp_path("disk_state");
        let path = file.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&file);

        let missing = file_disk_state(path.clone());
        assert!(!missing.exists);
        assert_eq!(missing.size, 0);

        std::fs::write(&file, b"hello world").unwrap();
        let present = file_disk_state(path.clone());
        assert!(present.exists);
        assert_eq!(present.size, 11);
        assert!(present.modified_ms > 0);

        // A rewrite with different content is visible as a new size.
        std::fs::write(&file, b"hello world, edited externally").unwrap();
        assert_eq!(file_disk_state(path.clone()).size, 30);

        std::fs::remove_file(&file).unwrap();
        assert!(!file_disk_state(path).exists);
    }

    #[test]
    fn a_directory_is_not_a_file() {
        let dir = temp_path("disk_state_dir");
        std::fs::create_dir_all(&dir).unwrap();
        assert!(!path_exists(dir.to_string_lossy().to_string()));
        std::fs::remove_dir(&dir).unwrap();
    }
}
