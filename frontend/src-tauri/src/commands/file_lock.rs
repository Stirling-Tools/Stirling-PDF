// Holds every disk file a window has open, the way Acrobat and Word do. A DMS
// (e.g. LEXolution.DMS) that checks a file out to disk polls for that lock and
// checks the file back in, deleting our copy, as soon as it sees the file free.
//
// One handle per file, read+write but sharing read only: other programs can
// still read it, but cannot write, rename or delete it. Saves go through the
// same handle, so the lock never lapses mid-save. Windows only; elsewhere
// nothing is locked and saves take the ordinary path.

use std::collections::BTreeMap;
use std::fs::File;
use std::io::{Seek, SeekFrom, Write};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

// A file handed over at launch is locked before the window loads it, and must
// survive the window's first claims, which do not list it yet.
const LAUNCH_GRACE: Duration = Duration::from_secs(120);

static LOCKS: Mutex<Locks> = Mutex::new(Locks::new());

struct Held {
    // Its own lock, so a save holds only this file while it writes. A file
    // closed mid-save keeps its entry until the save ends, so reopening it in
    // the meantime reuses this handle rather than failing to open a second.
    file: Arc<Mutex<File>>,
    writable: bool,
    launched_at: Option<Instant>,
    claimed: bool,
}

struct Locks {
    held: BTreeMap<String, Held>,
}

impl Locks {
    const fn new() -> Self {
        Self {
            held: BTreeMap::new(),
        }
    }

    fn lock_launch_file(&mut self, path: &str, now: Instant) {
        if self.held.contains_key(path) {
            return;
        }
        if let Some((file, writable)) = open_locked(path) {
            self.held.insert(
                path.to_string(),
                Held {
                    file: Arc::new(Mutex::new(file)),
                    writable,
                    launched_at: Some(now),
                    claimed: false,
                },
            );
        }
    }

    fn sync(&mut self, open: &[String], now: Instant) {
        self.held.retain(|path, held| {
            held.claimed = open.contains(path);
            if held.claimed {
                held.launched_at = None;
            }
            keep(held, now)
        });
        for path in open {
            if self.held.contains_key(path) {
                continue;
            }
            if let Some((file, writable)) = open_locked(path) {
                self.held.insert(
                    path.clone(),
                    Held {
                        file: Arc::new(Mutex::new(file)),
                        writable,
                        launched_at: None,
                        claimed: true,
                    },
                );
            }
        }
    }

    /// Drops locks nothing needs any more: unclaimed, past the launch grace, and not mid-save.
    fn sweep(&mut self, now: Instant) {
        self.held.retain(|_, held| keep(held, now));
    }

    /// The held handle a save to `path` must write through, if any.
    fn writer(&self, path: &str) -> Option<Arc<Mutex<File>>> {
        self.held
            .get(path)
            .filter(|held| held.writable)
            .map(|held| Arc::clone(&held.file))
    }
}

/// Ok(false) when no writable lock is held, so the caller writes normally.
fn write_through(file: Option<Arc<Mutex<File>>>, bytes: &[u8]) -> std::io::Result<bool> {
    let Some(file) = file else {
        return Ok(false);
    };
    let mut file = file
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    file.seek(SeekFrom::Start(0))?;
    file.write_all(bytes)?;
    file.set_len(bytes.len() as u64)?;
    file.sync_all()?;
    Ok(true)
}

fn keep(held: &Held, now: Instant) -> bool {
    let launch_pending = held
        .launched_at
        .is_some_and(|at| now.duration_since(at) < LAUNCH_GRACE);
    // A save in progress holds a clone of the handle.
    held.claimed || launch_pending || Arc::strong_count(&held.file) > 1
}

#[cfg(windows)]
fn open_locked(path: &str) -> Option<(File, bool)> {
    use crate::utils::add_log;
    use std::io::ErrorKind;
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 0x1;
    let open = |write: bool| {
        std::fs::OpenOptions::new()
            .read(true)
            .write(write)
            .share_mode(FILE_SHARE_READ)
            .open(path)
    };
    match open(true) {
        Ok(file) => Some((file, true)),
        // A read-only file (e.g. a DMS read-only checkout) can still be held
        // against deletion. Anything else, such as another program already
        // holding it, leaves the file unlocked, as before.
        Err(error) if error.kind() == ErrorKind::PermissionDenied => {
            open(false).ok().map(|file| (file, false))
        }
        Err(error) => {
            add_log(format!("⚠️ Could not lock {}: {}", path, error));
            None
        }
    }
}

#[cfg(not(windows))]
fn open_locked(_path: &str) -> Option<(File, bool)> {
    None
}

fn locks() -> std::sync::MutexGuard<'static, Locks> {
    LOCKS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

pub fn lock_launch_file(path: &str) {
    locks().lock_launch_file(path, Instant::now());
    // A file that never loads is never claimed, and nothing else may sync the
    // locks again, so the grace needs its own timer.
    std::thread::spawn(|| {
        std::thread::sleep(LAUNCH_GRACE);
        locks().sweep(Instant::now());
    });
}

/// Lock exactly the files some window has open, plus launch files still loading.
pub fn sync_locks(open: &[String]) {
    locks().sync(open, Instant::now());
}

/// Whether a save to `path` goes through write_locked_file. Asked first, so the
/// bytes cross IPC only when a lock is held.
#[tauri::command]
pub fn holds_writable_lock(path: String) -> bool {
    locks().writer(&path).is_some()
}

/// Raw body = the bytes; `path` header = the URI-encoded target path.
#[tauri::command]
pub async fn write_locked_file(request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw file bytes".to_string());
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| urlencoding::decode(value).ok())
        .ok_or_else(|| "Missing path header".to_string())?;
    // The global lock is dropped before the write, so a slow save does not
    // stall opening or closing other files.
    let file = locks().writer(&path);
    let written = write_through(file, bytes);
    // Releases the file if it was closed while this save was writing.
    locks().sweep(Instant::now());
    written.map_err(|error| error.to_string())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    fn temp_file(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("stirling_lock_{}_{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("checked-out.pdf");
        std::fs::write(&file, b"original").unwrap();
        file
    }

    fn key(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }

    // What a DMS does to decide the file is no longer in use.
    fn exclusive_open_succeeds(path: &Path) -> bool {
        use std::os::windows::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(path)
            .is_ok()
    }

    #[test]
    fn an_open_file_looks_in_use_and_cannot_be_deleted() {
        let path = temp_file("in_use");
        let mut locks = Locks::new();
        locks.sync(&[key(&path)], Instant::now());

        assert!(!exclusive_open_succeeds(&path));
        assert!(std::fs::remove_file(&path).is_err());
        // Other programs can still read it.
        assert_eq!(std::fs::read(&path).unwrap(), b"original");

        locks.sync(&[], Instant::now());
        assert!(exclusive_open_succeeds(&path));
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn saves_go_through_the_held_lock() {
        let path = temp_file("save");
        let mut locks = Locks::new();
        locks.sync(&[key(&path)], Instant::now());

        // The ordinary write path is refused while we hold the file.
        assert!(std::fs::write(&path, b"x").is_err());
        assert!(write_through(locks.writer(&key(&path)), b"saved").unwrap());
        assert_eq!(std::fs::read(&path).unwrap(), b"saved");
        assert!(!exclusive_open_succeeds(&path));

        locks.sync(&[], Instant::now());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_file_closed_mid_save_stays_locked_until_the_save_ends() {
        let path = temp_file("close_mid_save");
        let mut locks = Locks::new();
        locks.sync(&[key(&path)], Instant::now());
        let saving = locks.writer(&key(&path));

        locks.sync(&[], Instant::now());
        assert!(!exclusive_open_succeeds(&path));
        assert!(write_through(saving, b"saved").unwrap());
        locks.sweep(Instant::now());
        assert!(exclusive_open_succeeds(&path));
        assert_eq!(std::fs::read(&path).unwrap(), b"saved");
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_file_reopened_mid_save_stays_locked_after_the_save() {
        let path = temp_file("reopen_mid_save");
        let mut locks = Locks::new();
        locks.sync(&[key(&path)], Instant::now());
        let saving = locks.writer(&key(&path));

        locks.sync(&[], Instant::now());
        locks.sync(&[key(&path)], Instant::now());
        assert!(write_through(saving, b"saved").unwrap());
        locks.sweep(Instant::now());
        assert!(!exclusive_open_succeeds(&path));

        locks.sync(&[], Instant::now());
        assert!(exclusive_open_succeeds(&path));
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn an_unlocked_path_is_left_to_the_ordinary_write() {
        let path = temp_file("unlocked");
        assert!(!write_through(Locks::new().writer(&key(&path)), b"x").unwrap());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_launch_file_stays_locked_until_claimed_or_the_grace_runs_out() {
        let path = temp_file("launch");
        let start = Instant::now();
        let mut locks = Locks::new();
        locks.lock_launch_file(&key(&path), start);

        locks.sync(&[], start + Duration::from_secs(5));
        assert!(!exclusive_open_succeeds(&path));

        locks.sync(&[], start + LAUNCH_GRACE);
        assert!(exclusive_open_succeeds(&path));
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn an_unclaimed_launch_file_expires_without_another_sync() {
        let unclaimed = temp_file("expire_unclaimed");
        let claimed = temp_file("expire_claimed");
        let start = Instant::now();
        let mut locks = Locks::new();
        locks.lock_launch_file(&key(&unclaimed), start);
        locks.lock_launch_file(&key(&claimed), start);
        locks.sync(&[key(&claimed)], start + Duration::from_secs(1));

        locks.sweep(start + Duration::from_secs(5));
        assert!(!exclusive_open_succeeds(&unclaimed));

        locks.sweep(start + LAUNCH_GRACE);
        assert!(exclusive_open_succeeds(&unclaimed));
        assert!(!exclusive_open_succeeds(&claimed));

        locks.sync(&[], start + LAUNCH_GRACE);
        std::fs::remove_dir_all(unclaimed.parent().unwrap()).unwrap();
        std::fs::remove_dir_all(claimed.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_read_only_file_is_held_against_deletion_but_not_written() {
        let path = temp_file("read_only");
        let writable = std::fs::metadata(&path).unwrap().permissions();
        let mut read_only = writable.clone();
        read_only.set_readonly(true);
        std::fs::set_permissions(&path, read_only).unwrap();

        // A read-only file refuses write access anyway, so probe with read.
        let exclusive_read_succeeds = || {
            use std::os::windows::fs::OpenOptionsExt;
            std::fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(&path)
                .is_ok()
        };
        let mut locks = Locks::new();
        locks.sync(&[key(&path)], Instant::now());
        assert!(!exclusive_read_succeeds());
        assert!(!write_through(locks.writer(&key(&path)), b"x").unwrap());

        locks.sync(&[], Instant::now());
        assert!(exclusive_read_succeeds());
        std::fs::set_permissions(&path, writable).unwrap();
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
