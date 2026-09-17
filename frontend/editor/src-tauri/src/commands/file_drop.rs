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

/// Resolves the webview's DOM files against the real paths captured from the last
/// OS drop. Unknown or ambiguous files stay unlinked rather than taking an unsafe
/// save target.
#[tauri::command]
pub fn resolve_dropped_file_paths(files: Vec<DroppedFile>) -> Vec<Option<String>> {
    matching_paths(&files, snapshot().clone())
}

/// Starts capturing OS file-drop paths for this webview so resolve_dropped_file_paths
/// can hand them to the matching DOM files. No-op off macOS (Windows resolves the
/// DOM File directly through WebView2's AdditionalObjects bridge).
#[cfg(target_os = "macos")]
pub fn install_drag_path_capture(webview: *mut std::ffi::c_void) {
    macos_capture::install(webview);
}

#[cfg(not(target_os = "macos"))]
pub fn install_drag_path_capture(_webview: *mut std::ffi::c_void) {}

/// Frontend startup calls this so the capture is installed on the live WKWebView
/// (webview creation lifecycle hooks proved unreliable). Idempotent; no-op off macOS.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn install_drag_capture(webview: tauri::WebviewWindow) {
    if let Err(error) = webview.with_webview(|platform| install_drag_path_capture(platform.inner()))
    {
        log::warn!("Could not install drag-path capture: {error}");
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn install_drag_capture() {}

// Tauri keeps dragDropEnabled=false so the webview's own HTML5 drag-and-drop
// (in-page reordering, the drop zones) keeps working; that also means wry never
// reports the dropped paths to us. wry's WryWebView still overrides
// performDragOperation: and reads those paths off the dragging pasteboard before
// forwarding the drop on to WebKit, so we swizzle that method to record the same
// paths and then call straight through.
#[cfg(target_os = "macos")]
mod macos_capture {
    use super::snapshot;
    use objc2::runtime::{AnyObject, Bool, Imp, ProtocolObject, Sel};
    use objc2::sel;
    use objc2_app_kit::NSDraggingInfo;
    use objc2_foundation::{NSArray, NSString};
    use std::ffi::c_void;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};

    static ORIGINAL: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    // NSFilenamesPboardType is the legacy pasteboard type, but it is what wry reads
    // and it yields plain path strings; NSPasteboardTypeFileURL can hand back an
    // unresolvable file-reference URL for the same drop.
    #[allow(deprecated)]
    fn dragged_filenames(info: &ProtocolObject<dyn NSDraggingInfo>) -> Vec<PathBuf> {
        use objc2_app_kit::NSFilenamesPboardType;
        let pasteboard = info.draggingPasteboard();
        let filenames_type = unsafe { NSFilenamesPboardType };
        let types = NSArray::arrayWithObject(filenames_type);
        if pasteboard.availableTypeFromArray(&types).is_none() {
            return Vec::new();
        }
        let Some(list) = pasteboard.propertyListForType(filenames_type) else {
            return Vec::new();
        };
        let Ok(list) = list.downcast::<NSArray>() else {
            return Vec::new();
        };
        (0..list.count())
            .filter_map(|index| {
                list.objectAtIndex(index)
                    .downcast::<NSString>()
                    .ok()
                    .map(|name| PathBuf::from(name.to_string()))
            })
            .collect()
    }

    unsafe extern "C-unwind" fn perform_drag_operation(
        this: *mut AnyObject,
        cmd: Sel,
        sender: *mut AnyObject,
    ) -> Bool {
        if let Some(info) = (sender as *const ProtocolObject<dyn NSDraggingInfo>).as_ref() {
            let paths = dragged_filenames(info);
            if !paths.is_empty() {
                *snapshot() = paths;
            }
        }
        // Set before the swizzle is installed, so it is never null when reached.
        let original: unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> Bool =
            std::mem::transmute(ORIGINAL.load(Ordering::Acquire));
        original(this, cmd, sender)
    }

    pub fn install(webview: *mut c_void) {
        static INSTALLED: AtomicBool = AtomicBool::new(false);
        if INSTALLED.load(Ordering::SeqCst) {
            return;
        }
        let Some(object) = (unsafe { (webview as *const AnyObject).as_ref() }) else {
            return;
        };
        // The instance's runtime class is a dynamic NSKVONotifying_* subclass
        // (AppKit installs a KVO observer on the webview). performDragOperation:
        // is defined on wry's own WryWebView class, so walk up to it and swizzle
        // there; the KVO subclass inherits the replaced implementation.
        let mut class = object.class();
        while class.name().to_string_lossy().contains("NSKVONotifying")
            || !class.name().to_string_lossy().contains("WryWebView")
        {
            let Some(parent) = class.superclass() else {
                return;
            };
            class = parent;
        }
        let selector = sel!(performDragOperation:);
        let Some(method) = class.instance_method(selector) else {
            return;
        };
        // wry's WryWebView overrides performDragOperation:; if a future wry stops
        // doing so this reads as WKWebView's inherited method and we skip it,
        // rather than swizzling every WKWebView in the process.
        let inherited = class
            .superclass()
            .and_then(|parent| parent.instance_method(selector))
            .is_some_and(|parent_method| std::ptr::eq(parent_method, method));
        if inherited {
            return;
        }
        ORIGINAL.store(method.implementation() as *mut c_void, Ordering::Release);
        let replacement: Imp = unsafe {
            std::mem::transmute(
                perform_drag_operation
                    as unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> Bool,
            )
        };
        unsafe { method.set_implementation(replacement) };
        INSTALLED.store(true, Ordering::SeqCst);
    }
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
