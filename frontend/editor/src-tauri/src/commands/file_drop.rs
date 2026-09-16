use serde::Deserialize;

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

/// Resolves DOM files against the current macOS drag pasteboard, never the general clipboard.
/// Unknown or ambiguous files remain unlinked rather than acquiring an unsafe save target.
#[tauri::command]
pub fn resolve_dropped_file_paths(files: Vec<DroppedFile>) -> Vec<Option<String>> {
    matching_paths(&files, dragged_paths())
}

#[cfg(target_os = "macos")]
fn dragged_paths() -> Vec<std::path::PathBuf> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardNameDrag, NSPasteboardTypeFileURL};
    let pasteboard = NSPasteboard::pasteboardWithName(unsafe { NSPasteboardNameDrag });
    let Some(items) = pasteboard.pasteboardItems() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let value = item.stringForType(unsafe { NSPasteboardTypeFileURL })?;
            url::Url::parse(&value.to_string())
                .ok()?
                .to_file_path()
                .ok()
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
        std::fs::File::open(&copy)
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
