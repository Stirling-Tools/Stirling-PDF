use crate::commands::files::add_opened_file;
use crate::utils::add_log;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

// The primary window created from tauri.conf.json.
pub const MAIN_WINDOW_LABEL: &str = "main";

static NEXT_WINDOW_ID: AtomicU32 = AtomicU32::new(2);

// Per-window queues of stored-file IDs waiting to be opened. Unlike disk paths
// (which use the global OPENED_FILES queue), these reference files already in
// the shared IndexedDB store, so a "new window" opened from the My Files page
// loads the same file by reference. Keyed by the new window's label.
static PENDING_FILE_IDS: Mutex<Option<HashMap<String, Vec<String>>>> = Mutex::new(None);

fn next_window_label() -> String {
    let id = NEXT_WINDOW_ID.fetch_add(1, Ordering::SeqCst);
    format!("main-{}", id)
}

fn queue_file_ids(label: &str, ids: Vec<String>) {
    let mut guard = PENDING_FILE_IDS.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    map.entry(label.to_string()).or_default().extend(ids);
}

// Shared window builder: every Stirling window must use identical WebView2
// browser args so they can share one user-data folder (see the note below),
// so all spawn paths funnel through here.
fn build_window(app: &AppHandle, label: &str, url: &str) -> Result<WebviewWindow, String> {
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("Stirling-PDF")
        .inner_size(1280.0, 800.0)
        // Below this width the file manager collapses to its mobile layout,
        // so keep new windows above the breakpoint.
        .min_inner_size(1030.0, 600.0)
        .resizable(true);

    // WebView2 (Windows only) requires every webview sharing a user-data folder
    // to use identical additional_browser_args. wry's behaviour
    // (webview2/mod.rs:294): when the user provides args it uses them as-is and
    // does NOT prepend its own default `--disable-features=msWebOOUI,...`. So the
    // main window's actual args are EXACTLY what tauri.conf.json declares -
    // nothing more. We mirror that string byte-for-byte so windows share one data
    // dir (and thus IndexedDB / localStorage / cookies). macOS (WKWebView) and
    // Linux (WebKitGTK) don't have this constraint, so the arg is Windows-only.
    #[cfg(target_os = "windows")]
    let builder =
        builder.additional_browser_args("--enable-features=CertVerifierBuiltinFeature");

    builder.build().map_err(|e| e.to_string())
}

// Run `work` on the main thread and await its result. WebView2 on Windows
// refuses to create a webview off the main thread (HRESULT 0x8007139F), but
// Tauri command handlers run on a worker thread - so any window creation has to
// hop over first. Centralised here so every command does it the same way.
async fn run_on_main_thread_result<F, R>(app: &AppHandle, work: F) -> Result<R, String>
where
    F: FnOnce() -> R + Send + 'static,
    R: Send + 'static,
{
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(work());
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())
}

// Spawn a new webview window in the same Tauri process.
// The backend stays single; only the frontend is duplicated.
// If `paths` is non-empty, they're enqueued under the new window's label,
// so the React app pops them on mount just like a fresh launch with a file.
fn spawn_new_window(app: &AppHandle, paths: Vec<String>) -> Result<String, String> {
    let label = next_window_label();

    for path in &paths {
        add_opened_file(path.clone());
    }

    match build_window(app, &label, "/") {
        Ok(window) => {
            add_log(format!(
                "🪟 Spawned new window '{}' with {} initial file(s)",
                label,
                paths.len()
            ));
            // The new window pops the shared queue on mount, so the files are
            // already waiting for it. We target the emit at this window only
            // (not a broadcast) so already-open windows don't race to pop them.
            if !paths.is_empty() {
                let _ = window.emit_to(label.as_str(), "files-changed", ());
            }
            Ok(label)
        }
        Err(err) => {
            add_log(format!(
                "❌ Failed to spawn new window '{}': {}",
                label, err
            ));
            Err(err)
        }
    }
}

#[tauri::command]
pub async fn open_in_new_window(app: AppHandle, paths: Vec<String>) -> Result<String, String> {
    let valid_paths: Vec<String> = paths
        .into_iter()
        .filter(|p| {
            let exists = std::path::Path::new(p).exists();
            if !exists {
                add_log(format!(
                    "⚠️ Ignoring non-existent path for new window: {}",
                    p
                ));
            }
            exists
        })
        .collect();

    let app_clone = app.clone();
    run_on_main_thread_result(&app, move || spawn_new_window(&app_clone, valid_paths)).await?
}

// Open already-stored files (by IndexedDB id) in a fresh window. Used by the
// "Open in new window" action on the My Files page. The ids are queued under
// the new window's label; the new window pops them on mount and loads them from
// the shared store into its workspace.
#[tauri::command]
pub async fn open_files_in_new_window(
    app: AppHandle,
    file_ids: Vec<String>,
) -> Result<String, String> {
    let label = next_window_label();
    let app_clone = app.clone();
    run_on_main_thread_result(&app, move || {
        build_window(&app_clone, &label, "/").map(|window| {
            let count = file_ids.len();
            // Queue the ids only after the window is created, so a failed build
            // doesn't leave orphaned ids under a label no window will consume.
            queue_file_ids(&label, file_ids);
            add_log(format!(
                "🪟 Spawned new window '{}' for {} stored file(s)",
                label, count
            ));
            // The new window also pops on mount; this emit is a nudge in case it
            // mounted before the ids were queued.
            let _ = window.emit_to(label.as_str(), "window-files-ready", ());
            label.clone()
        })
    })
    .await?
}

// Pop (return and clear) the stored-file ids queued for the calling window.
#[tauri::command]
pub async fn pop_window_file_ids(window: WebviewWindow) -> Result<Vec<String>, String> {
    let label = window.label().to_string();
    let ids = {
        let mut guard = PENDING_FILE_IDS.lock().unwrap();
        guard
            .as_mut()
            .and_then(|map| map.remove(&label))
            .unwrap_or_default()
    };
    if !ids.is_empty() {
        add_log(format!(
            "📂 Returning {} stored file id(s) for window '{}'",
            ids.len(),
            label
        ));
    }
    Ok(ids)
}

// Pick the best existing window to receive an opened file: the focused one,
// else the main window, else any open window. Returns None only if there are
// no windows at all. Used so file-opens (file association, "open with") land in
// the window the user is actually looking at, and still work if the original
// "main" window has been closed.
pub fn target_window_label(app: &AppHandle) -> Option<String> {
    let windows = app.webview_windows();
    if let Some((label, _)) = windows
        .iter()
        .find(|(_, w)| w.is_focused().unwrap_or(false))
    {
        return Some(label.clone());
    }
    if windows.contains_key(MAIN_WINDOW_LABEL) {
        return Some(MAIN_WINDOW_LABEL.to_string());
    }
    windows.keys().next().cloned()
}

// Add files to the shared queue and notify a specific window to consume them.
// Used by drag-drop, the macOS open event, and the second-instance callback
// (when --new-window is NOT set). The emit is targeted at `label` so only that
// window pops the queue - other windows ignore it and keep their own files.
pub fn forward_files_to_window(app: &AppHandle, label: &str, paths: Vec<String>) {
    for path in &paths {
        add_opened_file(path.clone());
    }
    if let Some(window) = app.get_webview_window(label) {
        let _ = app.emit_to(label, "files-changed", ());
        let _ = window.set_focus();
        let _ = window.unminimize();
    } else {
        // Target window is gone; let any window pick the files up.
        let _ = app.emit("files-changed", ());
    }
}
