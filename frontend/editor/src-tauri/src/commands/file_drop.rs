use serde::Deserialize;
use std::sync::Mutex;

// The macOS drag pasteboard only holds the dragged file URLs while the drag
// session is live. The drop's resolve command is async IPC, so it runs a run
// loop turn after the session has ended and the pasteboard reads empty; the
// snapshot, taken from JS during dragover, is what the drop then matches against.
static DRAG_SNAPSHOT: Mutex<Vec<std::path::PathBuf>> = Mutex::new(Vec::new());

fn snapshot() -> std::sync::MutexGuard<'static, Vec<std::path::PathBuf>> {
    DRAG_SNAPSHOT
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedFile {
    name: String,
    size: u64,
    last_modified: u64,
}

fn matching_paths(files: &[DroppedFile], paths: Vec<std::path::PathBuf>) -> Vec<Option<String>> {
    files
        .iter()
        .map(|file| {
            let mut matches = paths.iter().filter(|path| {
                if path.file_name().and_then(|name| name.to_str()) != Some(file.name.as_str()) {
                    return false;
                }
                let Ok(metadata) = path.metadata() else {
                    return false;
                };
                let modified_ms = metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|time| time.as_millis() as u64);
                metadata.is_file()
                    && metadata.len() == file.size
                    && modified_ms.is_some_and(|ms| ms / 1000 == file.last_modified / 1000)
            });
            let path = matches.next()?;
            // Identical names/metadata in two folders cannot safely identify a save target.
            if matches.next().is_some() {
                return None;
            }
            path.to_str().map(String::from)
        })
        .collect()
}

/// Caches the live drag pasteboard mid-drag so the drop can resolve against it.
/// Called from dragover, the only point the macOS pasteboard is reliably populated.
#[tauri::command]
pub fn snapshot_dragged_file_paths() {
    let paths = dragged_paths();
    if !paths.is_empty() {
        *snapshot() = paths;
    }
}

/// Resolves DOM files against the macOS drag pasteboard, never the general clipboard,
/// falling back to the mid-drag snapshot once the drop has cleared the live one.
/// Unknown or ambiguous files remain unlinked rather than acquiring an unsafe save target.
#[tauri::command]
pub fn resolve_dropped_file_paths(files: Vec<DroppedFile>) -> Vec<Option<String>> {
    let live = dragged_paths();
    let paths = if live.is_empty() {
        std::mem::take(&mut *snapshot())
    } else {
        snapshot().clear();
        live
    };
    matching_paths(&files, paths)
}

#[cfg(target_os = "macos")]
fn dragged_paths() -> Vec<std::path::PathBuf> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardNameDrag, NSPasteboardTypeFileURL};
    use objc2_foundation::NSURL;
    let pasteboard = NSPasteboard::pasteboardWithName(unsafe { NSPasteboardNameDrag });
    let Some(items) = pasteboard.pasteboardItems() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let value = item.stringForType(unsafe { NSPasteboardTypeFileURL })?;
            let url = NSURL::URLWithString(&value)?;
            // The drag pasteboard hands back file *reference* URLs
            // (file:///.file/id=...); filePathURL resolves them to the concrete
            // filesystem path that name/size/mtime matching needs.
            let resolved = url.filePathURL().unwrap_or(url);
            resolved
                .path()
                .map(|path| std::path::PathBuf::from(path.to_string()))
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn dragged_paths() -> Vec<std::path::PathBuf> {
    // WebView2 resolves the DOM File through its AdditionalObjects bridge.
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn resolves_a_file_reference_url_to_its_real_path() {
        use objc2_foundation::{NSString, NSURL};
        let directory = std::env::temp_dir().join(format!("stirling-refurl-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("report.pdf");
        std::fs::write(&path, b"pdf").unwrap();

        // Build the file *reference* URL string the drag pasteboard hands over.
        let file_url = NSURL::fileURLWithPath(&NSString::from_str(path.to_str().unwrap()));
        let reference = file_url
            .fileReferenceURL()
            .expect("an existing file has a reference URL");
        let reference_string = reference
            .absoluteString()
            .expect("a reference URL has an absolute string");
        assert!(
            reference_string.to_string().contains("/.file/"),
            "expected a file reference URL, got {}",
            reference_string.to_string()
        );

        // Resolve it exactly as dragged_paths does.
        let url = NSURL::URLWithString(&reference_string).unwrap();
        let resolved = url.filePathURL().unwrap_or(url);
        let resolved_path = std::path::PathBuf::from(resolved.path().unwrap().to_string());

        assert_eq!(
            std::fs::canonicalize(&resolved_path).unwrap(),
            std::fs::canonicalize(&path).unwrap()
        );
        std::fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn links_only_a_unique_matching_file() {
        let directory = std::env::temp_dir().join(format!("stirling-drop-{}", std::process::id()));
        std::fs::create_dir_all(directory.join("other")).unwrap();
        let path = directory.join("report.pdf");
        std::fs::write(&path, b"pdf").unwrap();
        let modified = path.metadata().unwrap().modified().unwrap();
        let last_modified = modified
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let file = DroppedFile {
            name: "report.pdf".into(),
            size: 3,
            last_modified,
        };
        assert_eq!(
            matching_paths(&[file], vec![path.clone()]),
            vec![Some(path.to_str().unwrap().into())]
        );

        let copy = directory.join("other/report.pdf");
        std::fs::copy(&path, &copy).unwrap();
        std::fs::OpenOptions::new()
            .write(true)
            .open(&copy)
            .unwrap()
            .set_modified(modified)
            .unwrap();
        let file = DroppedFile {
            name: "report.pdf".into(),
            size: 3,
            last_modified,
        };
        assert_eq!(
            matching_paths(&[file], vec![path.clone(), copy]),
            vec![None]
        );

        for (name, size, time) in [
            ("other.pdf", 3, last_modified),
            ("report.pdf", 4, last_modified),
            ("report.pdf", 3, 0),
        ] {
            let file = DroppedFile {
                name: name.into(),
                size,
                last_modified: time,
            };
            assert_eq!(matching_paths(&[file], vec![path.clone()]), vec![None]);
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
}
