use crate::utils::add_log;
use serde::Serialize;
use std::io::ErrorKind;
use std::path::Path;
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
    add_log(format!(
        "📂 Returning and clearing {} opened file(s)",
        all_files.len()
    ));
    Ok(all_files)
}

// On-disk state of a linked file. Desktop files are meant to stay 1:1 with disk,
// so the frontend stats the real file rather than trusting its IndexedDB copy.

#[derive(Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum DiskUnavailableReason {
    Permission,
    Offline,
    Unknown,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(tag = "availability", rename_all = "camelCase")]
pub enum DiskFileState {
    #[serde(rename_all = "camelCase")]
    Present {
        size: u64,
        // Epoch ms; 0 when the platform gives us no mtime.
        modified_ms: u64,
    },
    Gone,
    #[serde(rename_all = "camelCase")]
    Unavailable {
        reason: DiskUnavailableReason,
    },
}

fn unavailable(reason: DiskUnavailableReason) -> DiskFileState {
    DiskFileState::Unavailable { reason }
}

fn reason_for(kind: ErrorKind) -> DiskUnavailableReason {
    match kind {
        ErrorKind::PermissionDenied => DiskUnavailableReason::Permission,
        ErrorKind::TimedOut | ErrorKind::NotConnected => DiskUnavailableReason::Offline,
        _ => DiskUnavailableReason::Unknown,
    }
}

fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(target_os = "macos")]
const MOUNT_PARENTS: &[&str] = &["/Volumes"];
#[cfg(target_os = "linux")]
const MOUNT_PARENTS: &[&str] = &["/mnt", "/media", "/run/media"];
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
const MOUNT_PARENTS: &[&str] = &[];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Absence {
    Deleted,
    Unreachable,
}

pub fn classify_absence(path: &Path) -> Absence {
    for ancestor in path
        .ancestors()
        .skip(1)
        .filter(|a| !a.as_os_str().is_empty())
    {
        match std::fs::metadata(ancestor) {
            Ok(meta) if meta.is_dir() => {
                return if is_mount_parent(ancestor) {
                    Absence::Unreachable
                } else {
                    Absence::Deleted
                };
            }
            Ok(_) => return Absence::Unreachable,
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(_) => return Absence::Unreachable,
        }
    }

    Absence::Unreachable
}

fn classify_absent(path: &Path) -> DiskFileState {
    match classify_absence(path) {
        Absence::Deleted => DiskFileState::Gone,
        Absence::Unreachable => match std::fs::metadata(path.parent().unwrap_or(path)) {
            Err(error) if error.kind() == ErrorKind::PermissionDenied => {
                unavailable(DiskUnavailableReason::Permission)
            }
            _ => unavailable(DiskUnavailableReason::Offline),
        },
    }
}

fn is_mount_parent(path: &Path) -> bool {
    MOUNT_PARENTS.iter().any(|root| path == Path::new(root))
}

#[tauri::command]
pub fn file_disk_state(path: String) -> DiskFileState {
    let path = Path::new(&path);
    match std::fs::metadata(path) {
        Ok(meta) if meta.is_file() => DiskFileState::Present {
            size: meta.len(),
            modified_ms: modified_ms(&meta),
        },
        Ok(_) => unavailable(DiskUnavailableReason::Unknown),
        Err(error) if error.kind() == ErrorKind::NotFound => classify_absent(path),
        Err(error) => unavailable(reason_for(error.kind())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("stirling_{}_{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn state(path: &Path) -> DiskFileState {
        file_disk_state(path.to_string_lossy().to_string())
    }

    #[test]
    fn a_real_file_reports_its_size_and_mtime() {
        let dir = temp_dir("present");
        let file = dir.join("report.pdf");
        std::fs::write(&file, b"hello world").unwrap();

        match state(&file) {
            DiskFileState::Present { size, modified_ms } => {
                assert_eq!(size, 11);
                assert!(modified_ms > 0);
            }
            other => panic!("expected Present, got {:?}", other),
        }

        // A rewrite with different content is visible as a new size.
        std::fs::write(&file, b"hello world, edited externally").unwrap();
        assert!(matches!(
            state(&file),
            DiskFileState::Present { size: 30, .. }
        ));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_deleted_file_in_a_folder_that_is_still_there_is_gone() {
        let dir = temp_dir("gone");
        let file = dir.join("report.pdf");
        std::fs::write(&file, b"x").unwrap();
        std::fs::remove_file(&file).unwrap();

        assert_eq!(state(&file), DiskFileState::Gone);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn losing_the_containing_folder_still_counts_as_gone() {
        let dir = temp_dir("gone_folder");
        let inner = dir.join("sub");
        std::fs::create_dir_all(&inner).unwrap();
        let file = inner.join("report.pdf");
        std::fs::write(&file, b"x").unwrap();
        std::fs::remove_dir_all(&inner).unwrap();

        assert_eq!(state(&file), DiskFileState::Gone);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_drive_that_is_not_mounted_is_offline_not_gone() {
        assert_eq!(
            state(Path::new(r"Q:\Docs\report.pdf")),
            unavailable(DiskUnavailableReason::Offline),
            "an unreachable location must never be reported as a deletion"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn an_ejected_volume_is_offline_because_volumes_is_a_mount_parent() {
        assert_eq!(
            state(Path::new("/Volumes/StirlingEjectedTestDisk/report.pdf")),
            unavailable(DiskUnavailableReason::Offline)
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_folder_we_may_not_read_is_unavailable_not_gone() {
        use std::os::unix::fs::PermissionsExt;

        let dir = temp_dir("denied");
        let file = dir.join("report.pdf");
        std::fs::write(&file, b"x").unwrap();
        std::fs::set_permissions(&dir, PermissionsExt::from_mode(0o000)).unwrap();

        let denied = state(&file);
        std::fs::set_permissions(&dir, PermissionsExt::from_mode(0o755)).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();

        if denied
            != (DiskFileState::Present {
                size: 1,
                modified_ms: 0,
            })
        {
            assert_eq!(
                denied,
                unavailable(DiskUnavailableReason::Permission),
                "a declined file-access prompt must not read as a deletion"
            );
        }
    }

    #[test]
    fn a_directory_is_not_a_file() {
        let dir = temp_dir("is_dir");
        assert_eq!(state(&dir), unavailable(DiskUnavailableReason::Unknown));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_relative_path_cannot_reach_the_destructive_answer() {
        assert_ne!(
            file_disk_state("report.pdf".to_string()),
            DiskFileState::Gone
        );
    }

    #[test]
    fn the_wire_shape_is_a_tagged_union_the_frontend_can_narrow_on() {
        let present = serde_json::to_string(&DiskFileState::Present {
            size: 7,
            modified_ms: 1,
        })
        .unwrap();
        assert_eq!(
            present,
            r#"{"availability":"present","size":7,"modifiedMs":1}"#
        );
        assert_eq!(
            serde_json::to_string(&DiskFileState::Gone).unwrap(),
            r#"{"availability":"gone"}"#
        );
        assert_eq!(
            serde_json::to_string(&unavailable(DiskUnavailableReason::Permission)).unwrap(),
            r#"{"availability":"unavailable","reason":"permission"}"#
        );
    }
}
