// msiexec runs with Redirection Guard, and an app it launches after install or update inherits
// it, so the backend and its tools cannot follow user-made junctions like scoop's apps\*\current.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};

use windows::Win32::System::Threading::{
    GetCurrentProcess, GetProcessMitigationPolicy, ProcessRedirectionTrustPolicy,
};

use crate::utils::add_log;

const ENFORCE_REDIRECTION_TRUST: u32 = 0x1;
const RELAUNCH_MARKER: &str = "stirling-pdf-redirection-guard-relaunch";
const RELAUNCH_COOLDOWN: Duration = Duration::from_secs(60);

/// Starts a fresh instance through explorer.exe, which does not pass the guard on, when this
/// process inherited Redirection Guard. Returns true when this process should exit.
pub fn relaunch_if_guarded() -> bool {
    if !redirection_guard_enforced() {
        return false;
    }
    // explorer.exe cannot forward arguments, so a launch carrying files or links keeps running.
    if std::env::args_os().len() > 1 {
        add_log("⚠️ Redirection Guard inherited, not relaunching a launch with arguments".to_string());
        return false;
    }
    let marker = std::env::temp_dir().join(RELAUNCH_MARKER);
    if relaunched_recently(&marker) {
        add_log("⚠️ Redirection Guard still inherited after relaunch, continuing".to_string());
        return false;
    }
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => {
            add_log(format!("⚠️ Redirection Guard relaunch skipped, no exe path: {}", e));
            return false;
        }
    };
    let _ = std::fs::write(&marker, b"");
    match Command::new(explorer_path()).arg(&exe).spawn() {
        Ok(_) => {
            add_log("🔁 Relaunching outside the installer's Redirection Guard".to_string());
            true
        }
        Err(e) => {
            add_log(format!("⚠️ Redirection Guard relaunch failed: {}", e));
            false
        }
    }
}

fn redirection_guard_enforced() -> bool {
    let mut flags: u32 = 0;
    // SAFETY: the pseudo-handle needs no closing and the buffer is the policy's u32 bitfield.
    let queried = unsafe {
        GetProcessMitigationPolicy(
            GetCurrentProcess(),
            ProcessRedirectionTrustPolicy,
            (&mut flags as *mut u32).cast(),
            std::mem::size_of::<u32>(),
        )
    };
    queried.is_ok() && flags & ENFORCE_REDIRECTION_TRUST != 0
}

fn relaunched_recently(marker: &Path) -> bool {
    std::fs::metadata(marker)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|age| age < RELAUNCH_COOLDOWN)
}

fn explorer_path() -> PathBuf {
    let windir = std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
    PathBuf::from(windir).join("explorer.exe")
}
