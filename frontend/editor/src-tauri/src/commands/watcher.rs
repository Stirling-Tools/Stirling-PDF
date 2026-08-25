use crate::utils::add_log;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// Watches linked files live so an external edit or delete does not sit stale on screen.
// Directories, not files: editors save by rename, which drops a file-level watch.

/// The watcher itself. Dropping it stops delivery, so it is parked here.
static WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
/// Files we care about. Events for anything else in a watched directory are
/// dropped, so watching a busy folder like Downloads stays quiet.
static WATCHED_FILES: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());
/// Directories currently registered, so a re-watch only pays for the delta.
static WATCHED_DIRS: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());

/// Event payload; `paths` are the linked files affected, as the frontend knows them.
#[derive(Clone, Serialize)]
struct DiskChangePayload {
    paths: Vec<String>,
}

pub const DISK_CHANGE_EVENT: &str = "disk-files-changed";

fn is_watched(path: &Path) -> bool {
    WATCHED_FILES
        .lock()
        .map(|files| files.iter().any(|watched| watched == path))
        .unwrap_or(false)
}

// Only content/existence changes matter. Access events (someone opened the file
// for reading) would fire constantly and mean nothing to us.
fn is_interesting(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    )
}

/// Watch the parent directory of every given file. Replaces any previous watch
/// set. An empty list tears the watcher down.
#[tauri::command]
pub fn watch_disk_paths(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    let files: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();

    // Deduplicate parents: many files usually share a handful of folders.
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    for file in &files {
        if let Some(parent) = file.parent() {
            if seen.insert(parent.to_path_buf()) {
                dirs.push(parent.to_path_buf());
            }
        }
    }

    *WATCHED_FILES.lock().map_err(|e| e.to_string())? = files;

    if dirs.is_empty() {
        *WATCHER.lock().map_err(|e| e.to_string())? = None;
        WATCHED_DIRS.lock().map_err(|e| e.to_string())?.clear();
        return Ok(());
    }

    let mut guard = WATCHER.lock().map_err(|e| e.to_string())?;
    let mut current = WATCHED_DIRS.lock().map_err(|e| e.to_string())?;

    // Same folders as last time: the file list above is all that needed updating.
    if guard.is_some() && *current == dirs {
        return Ok(());
    }

    let handler_app = app.clone();
    let mut watcher = notify::recommended_watcher(move |result| match result {
        Ok(event) => {
            let notify::Event { kind, paths, .. } = event;
            if !is_interesting(&kind) {
                return;
            }
            let affected: Vec<String> = paths
                .iter()
                .filter(|path| is_watched(path))
                .map(|path| path.to_string_lossy().to_string())
                .collect();
            if affected.is_empty() {
                return;
            }
            if let Err(e) = handler_app.emit(DISK_CHANGE_EVENT, DiskChangePayload { paths: affected })
            {
                add_log(format!("⚠️ Failed to emit disk change event: {}", e));
            }
        }
        Err(e) => add_log(format!("⚠️ File watcher error: {}", e)),
    })
    .map_err(|e| e.to_string())?;

    // A folder that has itself been removed just means nothing to watch there.
    let mut watched: Vec<PathBuf> = Vec::new();
    for dir in dirs {
        match watcher.watch(&dir, RecursiveMode::NonRecursive) {
            Ok(()) => watched.push(dir),
            Err(e) => add_log(format!("⚠️ Could not watch {}: {}", dir.display(), e)),
        }
    }

    add_log(format!("👀 Watching {} folder(s) for disk changes", watched.len()));
    *current = watched;
    *guard = Some(watcher);
    Ok(())
}

/// Stop watching entirely (window closing, or the last linked file went away).
#[tauri::command]
pub fn unwatch_disk_paths() -> Result<(), String> {
    *WATCHER.lock().map_err(|e| e.to_string())? = None;
    WATCHED_FILES.lock().map_err(|e| e.to_string())?.clear();
    WATCHED_DIRS.lock().map_err(|e| e.to_string())?.clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, ModifyKind, RemoveKind};

    #[test]
    fn only_content_and_existence_events_are_interesting() {
        assert!(is_interesting(&EventKind::Create(CreateKind::File)));
        assert!(is_interesting(&EventKind::Modify(ModifyKind::Data(
            DataChange::Content
        ))));
        assert!(is_interesting(&EventKind::Remove(RemoveKind::File)));
        // A read is not a change; these would otherwise fire constantly.
        assert!(!is_interesting(&EventKind::Access(
            notify::event::AccessKind::Read
        )));
        assert!(!is_interesting(&EventKind::Any));
    }

    #[test]
    fn events_outside_the_linked_set_are_ignored() {
        WATCHED_FILES
            .lock()
            .unwrap()
            .clone_from(&vec![PathBuf::from("/docs/report.pdf")]);

        assert!(is_watched(Path::new("/docs/report.pdf")));
        // Same folder, different file - a busy Downloads folder must stay quiet.
        assert!(!is_watched(Path::new("/docs/unrelated.pdf")));

        WATCHED_FILES.lock().unwrap().clear();
        assert!(!is_watched(Path::new("/docs/report.pdf")));
    }
}
