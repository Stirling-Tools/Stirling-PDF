use crate::state::connection_state::{AppConnectionState, ConnectionMode};
use crate::utils::{add_log, app_data_dir};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Removes shutdown markers left by previous sessions. The current path cannot
/// exist yet, so it is never a sweep target.
fn sweep_stale_shutdown_files(work_dir: &Path, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(work_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path == keep {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if name.starts_with(".backend-stop") {
            let _ = std::fs::remove_file(&path);
        }
    }
}

// Backend lifecycle and port, shared by the commands and the exit path.
static BACKEND_LIFECYCLE: BackendLifecycle = BackendLifecycle::new();
static BACKEND_PORT: Mutex<Option<u16>> = Mutex::new(None);

/// The backend slot and the notification that hands it from a start to the
/// shutdown. `Stopping` is terminal: no start may own a backend after it.
struct BackendLifecycle<P: BackendProcess = CommandChild> {
    slot: Mutex<BackendSlot<P>>,
    changed: Condvar,
}

/// What a shutdown found when it committed.
enum TakeOutcome<P: BackendProcess = CommandChild> {
    /// Nothing was running and no start was pending.
    Nothing,
    /// A start was still resolving when the wait ran out.
    StartUnresolved,
    /// The backend to stop.
    Backend(BackendInstance<P>),
}

enum BackendSlot<P: BackendProcess = CommandChild> {
    Empty,
    /// A start owns the slot until it publishes a child or hands it back.
    Starting,
    Running(BackendInstance<P>),
    Stopping,
}

/// Stops one backend process. Production uses `CommandChild`; the trait is the
/// seam that lets tests drive a fake or a real child process.
trait BackendProcess: Send + 'static {
    fn pid(&self) -> u32;
    /// Sends a kill signal. Whether the process exited is decided by the
    /// instance's termination notification: plugin versions differ on whether
    /// this call waits for it.
    fn kill(self) -> std::io::Result<()>;
}

impl BackendProcess for CommandChild {
    fn pid(&self) -> u32 {
        CommandChild::pid(self)
    }

    fn kill(self) -> std::io::Result<()> {
        CommandChild::kill(self).map_err(|error| std::io::Error::other(error.to_string()))
    }
}

/// A registered backend: its process, the marker it watches, and the flag its
/// output monitor raises when it terminates.
struct BackendInstance<P: BackendProcess = CommandChild> {
    process: P,
    shutdown_file: PathBuf,
    exited: Arc<AtomicBool>,
}

impl<P: BackendProcess> BackendLifecycle<P> {
    const fn new() -> Self {
        Self {
            slot: Mutex::new(BackendSlot::Empty),
            changed: Condvar::new(),
        }
    }

    /// Reserves the slot for a start. The guard hands the reservation back when
    /// the start ends without publishing a child.
    fn reserve_start(&self) -> Result<StartReservation<'_, P>, String> {
        let mut slot = self.slot.lock().unwrap();
        match *slot {
            BackendSlot::Empty => {
                *slot = BackendSlot::Starting;
                Ok(StartReservation { lifecycle: self })
            }
            BackendSlot::Starting => {
                add_log("⚠️ Backend already starting, skipping duplicate start".to_string());
                Err("Backend startup already in progress".to_string())
            }
            BackendSlot::Running(_) => {
                add_log("⚠️ Backend process already running, skipping start".to_string());
                Err("Backend already running".to_string())
            }
            BackendSlot::Stopping => {
                add_log("⚠️ Backend shutdown already started, refusing to start".to_string());
                Err("Backend is shutting down".to_string())
            }
        }
    }

    /// Publishes a spawned child and wakes a waiting shutdown. A shutdown that
    /// committed first takes it straight back out.
    fn register_backend(&self, instance: BackendInstance<P>) {
        let mut slot = self.slot.lock().unwrap();
        *slot = BackendSlot::Running(instance);
        self.changed.notify_all();
    }

    /// Commits shutdown and takes the backend, waiting out a start that has not
    /// published yet.
    fn take_for_shutdown(&self, wait: Duration) -> TakeOutcome<P> {
        let mut slot = self.slot.lock().unwrap();
        let deadline = Instant::now() + wait;
        // Spurious wake-ups re-check the slot.
        while matches!(*slot, BackendSlot::Starting) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                *slot = BackendSlot::Stopping;
                return TakeOutcome::StartUnresolved;
            }
            let (guard, _) = self.changed.wait_timeout(slot, remaining).unwrap();
            slot = guard;
        }

        match std::mem::replace(&mut *slot, BackendSlot::Stopping) {
            BackendSlot::Running(instance) => TakeOutcome::Backend(instance),
            _ => TakeOutcome::Nothing,
        }
    }

    /// True once shutdown owns the slot. Racy by design: the handshake covers a
    /// spawn already running.
    fn shutdown_committed(&self) -> bool {
        matches!(*self.slot.lock().unwrap(), BackendSlot::Stopping)
    }

    /// Hands an unregistered slot back. Notifies even when the slot is already
    /// `Stopping`, which is how the shutdown learns the start is over.
    fn release_start(&self) {
        let mut slot = self.slot.lock().unwrap();
        if matches!(*slot, BackendSlot::Starting) {
            *slot = BackendSlot::Empty;
        }
        self.changed.notify_all();
    }

    /// Clears the slot for the backend whose monitor raised `exited`. A monitor
    /// must never retire a backend that replaced it.
    fn retire(&self, exited: &Arc<AtomicBool>) {
        let mut slot = self.slot.lock().unwrap();
        if let BackendSlot::Running(instance) = &*slot {
            if Arc::ptr_eq(&instance.exited, exited) {
                *slot = BackendSlot::Empty;
            }
        }
    }
}

/// Holds a start's reservation; dropping it hands an unpublished slot back.
struct StartReservation<'a, P: BackendProcess> {
    lifecycle: &'a BackendLifecycle<P>,
}

impl<P: BackendProcess> Drop for StartReservation<'_, P> {
    fn drop(&mut self) {
        self.lifecycle.release_start();
    }
}

// Extract port number from "Stirling-PDF running on port: PORT" log line
fn extract_port_from_running_log(log_line: &str) -> Option<u16> {
    // Look for pattern: "running on port: PORT"
    if let Some(start) = log_line.find("running on port: ") {
        let after_prefix = &log_line[start + 17..]; // Skip "running on port: "
        // Take digits until whitespace or end of line
        let port_str: String = after_prefix.chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        return port_str.parse::<u16>().ok();
    }
    None
}

// Find the bundled JRE and return the java executable path
fn find_bundled_jre(resource_dir: &PathBuf) -> Result<PathBuf, String> {
    let jre_dir = resource_dir.join("runtime").join("jre");
    let java_executable = if cfg!(windows) {
        jre_dir.join("bin").join("java.exe")
    } else {
        jre_dir.join("bin").join("java")
    };

    if !java_executable.exists() {
        let error_msg = format!("❌ Bundled JRE not found at: {:?}", java_executable);
        add_log(error_msg.clone());
        return Err(error_msg);
    }

    add_log(format!("✅ Found bundled JRE: {:?}", java_executable));
    Ok(java_executable)
}

// Find the Stirling-PDF JAR file
fn find_stirling_jar(resource_dir: &PathBuf) -> Result<PathBuf, String> {
    let libs_dir = resource_dir.join("libs");
    let mut jar_files: Vec<_> = std::fs::read_dir(&libs_dir)
        .map_err(|e| {
            let error_msg = format!("Failed to read libs directory: {}. Make sure the JAR is copied to libs/", e);
            add_log(error_msg.clone());
            error_msg
        })?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let path = entry.path();
            // Match any .jar file containing "stirling-pdf" (case-insensitive)
            path.extension().and_then(|s| s.to_str()).map(|ext| ext.eq_ignore_ascii_case("jar")).unwrap_or(false)
                && path.file_name()
                    .and_then(|f| f.to_str())
                    .map(|name| name.to_ascii_lowercase().contains("stirling-pdf"))
                    .unwrap_or(false)
        })
        .collect();

    if jar_files.is_empty() {
        let error_msg = "No Stirling-PDF JAR found in libs directory.".to_string();
        add_log(error_msg.clone());
        return Err(error_msg);
    }

    // Sort by parsed version, newest first. A name sort would rank 3.9.0 above
    // 3.10.0, launching an older backend than the one that shipped.
    jar_files.sort_by(|a, b| {
        let key_a = version_key(&a.file_name().to_string_lossy());
        let key_b = version_key(&b.file_name().to_string_lossy());
        key_b.cmp(&key_a)
    });

    let jar_path = jar_files[0].path();
    add_log(format!("📋 Selected JAR: {:?}", jar_path.file_name().unwrap()));
    Ok(jar_path)
}

/// One component of a prerelease suffix. Recognized stages sort by maturity
/// (snapshot < alpha < beta < milestone < rc) rather than alphabetically, so a
/// development `SNAPSHOT` cannot outrank a release candidate. Unrecognized words
/// stay text, and a bare stage sorts below the same stage with a number (`rc` <
/// `rc1`) because a shorter token list precedes its own extension.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
enum PrereleaseToken {
    Stage(u8),
    Numeric(u64),
    Text(String),
}

/// Maturity rank for a known prerelease stage, or `None` to keep the word as
/// text. Rankings ascend toward the release candidate so a validated build wins.
fn stage_rank(word: &str) -> Option<u8> {
    Some(match word {
        "snapshot" | "dev" => 0,
        "alpha" => 1,
        "beta" => 2,
        "milestone" => 3,
        "rc" => 4,
        _ => return None,
    })
}

/// Split a prerelease suffix into ordered tokens, dropping separators so
/// `rc.10` and `rc10` compare the same.
fn prerelease_tokens(suffix: &str) -> Vec<PrereleaseToken> {
    let mut tokens = Vec::new();
    let mut chars = suffix.chars().peekable();
    while let Some(&current) = chars.peek() {
        if current.is_ascii_digit() {
            let mut value: u64 = 0;
            while let Some(&digit) = chars.peek() {
                match digit.to_digit(10) {
                    Some(d) => {
                        value = value.saturating_mul(10).saturating_add(u64::from(d));
                        chars.next();
                    }
                    None => break,
                }
            }
            tokens.push(PrereleaseToken::Numeric(value));
        } else if current.is_ascii_alphabetic() {
            let mut text = String::new();
            while let Some(&letter) = chars.peek() {
                if letter.is_ascii_alphabetic() {
                    text.push(letter.to_ascii_lowercase());
                    chars.next();
                } else {
                    break;
                }
            }
            match stage_rank(&text) {
                Some(rank) => tokens.push(PrereleaseToken::Stage(rank)),
                None => tokens.push(PrereleaseToken::Text(text)),
            }
        } else {
            chars.next();
        }
    }
    tokens
}

/// Ordering key for `stirling-pdf-<version>.jar`: the numeric release components,
/// whether the version is a final release (1 for final release, 0 for prerelease),
/// and the prerelease identifiers. Anything unparseable counts as zero so comparison never
/// panics, while final releases sort above prereleases, and prereleases order by stage
/// maturity (snapshot < alpha < beta < milestone < rc) then by stage number (rc2 < rc10).
fn version_key(name: &str) -> (Vec<u64>, u8, Vec<PrereleaseToken>) {
    let lower = name.to_ascii_lowercase();
    let version = lower
        .split_once("stirling-pdf-")
        .map(|(_, rest)| rest)
        .and_then(|rest| rest.strip_suffix(".jar"))
        .unwrap_or(&lower);
    let (release, suffix) = match version.split_once(['-', '_']) {
        Some((release, suffix)) => (release, suffix),
        None => (version, ""),
    };
    (
        release
            .split('.')
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect(),
        if suffix.is_empty() { 1 } else { 0 },
        prerelease_tokens(suffix),
    )
}

// Normalize path to remove Windows UNC prefix
fn normalize_path(path: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        let path_str = path.to_string_lossy();
        if path_str.starts_with(r"\\?\") {
            PathBuf::from(&path_str[4..]) // Remove \\?\ prefix
        } else {
            path.clone()
        }
    } else {
        path.clone()
    }
}

fn migrate_legacy_workspace(legacy_dir: &PathBuf, target_root: &PathBuf) -> std::io::Result<()> {
    for entry in std::fs::read_dir(legacy_dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dest_path = target_root.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else if file_type.is_file() {
            if let Some(parent) = dest_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&src_path, &dest_path)?;
        }
    }

    Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&src_path, &dest_path)?;
        }
    }

    Ok(())
}

// Create, configure and run the Java command to run Stirling-PDF JAR
fn run_stirling_pdf_jar(app: &tauri::AppHandle, java_path: &PathBuf, jar_path: &PathBuf) -> Result<(), String> {
    // Get platform-specific application data directory for Tauri mode
    let app_data_dir = app_data_dir();

    // Create subdirectories for different purposes
    let config_dir = app_data_dir.join("configs");
    let log_dir = app_data_dir.join("logs");
    let work_dir = app_data_dir.clone();
    let legacy_work_dir = app_data_dir.join("workspace");

    // Create all necessary directories
    std::fs::create_dir_all(&app_data_dir).ok();
    std::fs::create_dir_all(&log_dir).ok();
    std::fs::create_dir_all(&work_dir).ok();
    std::fs::create_dir_all(&config_dir).ok();

    // Migrate legacy workspace content into the app data root before launch.
    if legacy_work_dir.exists() {
        add_log(format!("📦 Migrating legacy workspace from {}", legacy_work_dir.display()));
        if let Err(err) = migrate_legacy_workspace(&legacy_work_dir, &app_data_dir) {
            add_log(format!("⚠️ Failed to migrate legacy workspace: {}", err));
        } else {
            match std::fs::remove_dir_all(&legacy_work_dir) {
                Ok(_) => add_log("✅ Removed legacy workspace directory after migration".to_string()),
                Err(err) => add_log(format!("⚠️ Failed to remove legacy workspace: {}", err)),
            }
        }
    }

    add_log(format!("📁 App data directory: {}", app_data_dir.display()));
    add_log(format!("📁 Log directory: {}", log_dir.display()));
    add_log(format!("📁 Working directory: {}", work_dir.display()));
    add_log(format!("📁 Config directory: {}", config_dir.display()));

    // Define all Java options with Tauri-specific paths
    let log_path_option = format!("-Dlogging.file.path={}", log_dir.display());

    let mut java_options = vec![
        "-Xmx2g",
        "-DBROWSER_OPEN=false",
        "-DSTIRLING_PDF_TAURI_MODE=true",
        &log_path_option,
        "-Dlogging.file.name=stirling-pdf.log",
        "-Dserver.port=0",  // Let OS assign an available port
        // No reverse proxy in front of the local sidecar, so don't trust forwarded headers.
        // Stops a LAN caller spoofing X-Forwarded-For to defeat the desktop-only signing gate.
        "-Dserver.forward-headers-strategy=none",
        "-Dsecurity.enableLogin=false",  // Disable login for desktop mode
        "-Dsecurity.csrfDisabled=true",  // Disable CSRF for desktop mode
    ];

    // Enable the login agreement on local desktop installs when it has been provisioned.
    if crate::commands::connection::login_agreement_enabled(app) {
        java_options.push("-Dlegal.loginAgreement.enabled=true");
    }

    java_options.push("-jar");
    java_options.push(jar_path.to_str().unwrap());

    // Log the equivalent command for external testing
    let java_command = format!(
        "TAURI_PARENT_PID={} \"{}\" {}",
        std::process::id(),
        java_path.display(),
        java_options.join(" ")
    );
    add_log(format!("🔧 Equivalent command: {}", java_command));
    add_log(format!("📁 Backend logs will be in: {}", log_dir.display()));

    // Additional macOS-specific checks
    if cfg!(target_os = "macos") {
        // Check if java executable has execute permissions
        if let Ok(metadata) = std::fs::metadata(java_path) {
            let permissions = metadata.permissions();
            add_log(format!("🔍 Java executable permissions: {:?}", permissions));

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = permissions.mode();
                add_log(format!("🔍 Java executable mode: 0o{:o}", mode));
                if mode & 0o111 == 0 {
                    add_log("⚠️ Java executable may not have execute permissions".to_string());
                }
            }
        }

        // Check if we can read the JAR file
        if let Ok(metadata) = std::fs::metadata(jar_path) {
            add_log(format!("📦 JAR file size: {} bytes", metadata.len()));
        } else {
            add_log("⚠️ Cannot read JAR file metadata".to_string());
        }
    }

    // Sentinel for a graceful stop on every platform; signals are not portable.
    // The name is per launch so a marker a previous session failed to clear can
    // never stop this one; stale markers are swept here, before this launch
    // owns one.
    let shutdown_file = work_dir.join(format!(
        ".backend-stop-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis())
            .unwrap_or(0)
    ));
    sweep_stale_shutdown_files(&work_dir, &shutdown_file);

    let sidecar_command = app
        .shell()
        .command(java_path.to_str().unwrap())
        .args(java_options)
        .current_dir(&work_dir) // Set working directory to writable location
        .env("TAURI_PARENT_PID", std::process::id().to_string())
        .env("STIRLING_PDF_CONFIG_DIR", config_dir.to_str().unwrap())
        .env("STIRLING_PDF_LOG_DIR", log_dir.to_str().unwrap())
        .env("STIRLING_PDF_WORK_DIR", work_dir.to_str().unwrap())
        .env(
            "STIRLING_PDF_SHUTDOWN_FILE",
            shutdown_file.to_str().unwrap(),
        );

    // A spawn that starts after shutdown committed would only be killed again.
    if BACKEND_LIFECYCLE.shutdown_committed() {
        add_log("⚠️ Backend shutdown already started, skipping the spawn".to_string());
        return Err("Backend is shutting down".to_string());
    }

    add_log("⚙️ Starting backend with bundled JRE...".to_string());

    let (rx, child) = sidecar_command.spawn().map_err(|e| {
        let error_msg = format!("❌ Failed to spawn sidecar: {}", e);
        add_log(error_msg.clone());
        error_msg
    })?;

    let exited = Arc::new(AtomicBool::new(false));
    let instance = BackendInstance {
        process: child,
        shutdown_file: shutdown_file.clone(),
        exited: exited.clone(),
    };

    // Shutdown may commit while the child spawns; it takes the instance back out
    // of the slot.
    BACKEND_LIFECYCLE.register_backend(instance);

    add_log("✅ Backend started with bundled JRE, monitoring output...".to_string());

    // The monitor raises `exited`, so it runs even when shutdown owns the instance.
    monitor_backend_output(rx, exited);

    Ok(())
}

// Monitor backend output in a separate task
fn monitor_backend_output(
    mut rx: tauri::async_runtime::Receiver<tauri_plugin_shell::process::CommandEvent>,
    exited: Arc<AtomicBool>,
) {
    tokio::spawn(async move {
        let mut _startup_detected = false;
        let mut error_count = 0;

        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(output) => {
                    let output_str = String::from_utf8_lossy(&output);
                    // Strip exactly one trailing newline to avoid double newlines
                    let output_str = output_str.strip_suffix('\n').unwrap_or(&output_str);
                    add_log(format!("📤 Backend: {}", output_str));

                    // Look for actual runtime port from web server initialization
                    // Format: "Stirling-PDF running on port: PORT"
                    if output_str.contains("running on port:") {
                        _startup_detected = true;
                        if let Some(port) = extract_port_from_running_log(&output_str) {
                            let mut port_guard = BACKEND_PORT.lock().unwrap();
                            *port_guard = Some(port);
                            add_log(format!("🎉 Backend started on port: {}", port));
                            add_log(format!("🔌 Navigate to: http://127.0.0.1:{}/", port));
                        }
                    }

                    if output_str.contains("Started SPDFApplication") {
                        _startup_detected = true;
                        add_log(format!("🎉 Backend startup completed: {}", output_str));
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(output) => {
                    let output_str = String::from_utf8_lossy(&output);
                    // Strip exactly one trailing newline to avoid double newlines
                    let output_str = output_str.strip_suffix('\n').unwrap_or(&output_str);
                    add_log(format!("📥 Backend Error: {}", output_str));

                    // Look for error indicators
                    if output_str.contains("ERROR") || output_str.contains("Exception") || output_str.contains("FATAL") {
                        error_count += 1;
                        add_log(format!("⚠️ Backend error #{}: {}", error_count, output_str));
                    }

                    // Look for specific common issues
                    if output_str.contains("Address already in use") {
                        add_log("🚨 CRITICAL: Port 8080 is already in use by another process!".to_string());
                    }
                    if output_str.contains("java.lang.ClassNotFoundException") {
                        add_log("🚨 CRITICAL: Missing Java dependencies!".to_string());
                    }
                    if output_str.contains("java.io.FileNotFoundException") {
                        add_log("🚨 CRITICAL: Required file not found!".to_string());
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Error(error) => {
                    add_log(format!("❌ Backend process error: {}", error));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                    add_log(format!("💀 Backend terminated with code: {:?}", payload.code));
                    if let Some(code) = payload.code {
                        match code {
                            0 => println!("✅ Process terminated normally"),
                            1 => println!("❌ Process terminated with generic error"),
                            2 => println!("❌ Process terminated due to misuse"),
                            126 => println!("❌ Command invoked cannot execute"),
                            127 => println!("❌ Command not found"),
                            128 => println!("❌ Invalid exit argument"),
                            130 => println!("❌ Process terminated by Ctrl+C"),
                            _ => println!("❌ Process terminated with code: {}", code),
                        }
                    }
                    exited.store(true, Ordering::Release);
                    BACKEND_LIFECYCLE.retire(&exited);
                }
                _ => {
                    println!("🔍 Unknown command event: {:?}", event);
                }
            }
        }

        if error_count > 0 {
            println!("⚠️ Backend process ended with {} errors detected", error_count);
        }
    });
}

// Command to start the backend with bundled JRE
#[tauri::command]
pub async fn start_backend(
    app: tauri::AppHandle,
    connection_state: tauri::State<'_, AppConnectionState>,
) -> Result<String, String> {
    add_log("🚀 start_backend() called - Attempting to start backend with bundled JRE...".to_string());

    // Check connection mode
    let mode = {
        let state = connection_state.0.lock().map_err(|e| {
            let error_msg = format!("❌ Failed to access connection state: {}", e);
            add_log(error_msg.clone());
            error_msg
        })?;
        state.mode.clone()
    };

    match mode {
        ConnectionMode::SaaS => {
            add_log("☁️ Running in SaaS mode - starting local backend".to_string());
        }
        ConnectionMode::SelfHosted => {
            add_log("🌐 Running in Self-Hosted mode - starting local backend (for hybrid execution support)".to_string());
        }
        ConnectionMode::Local => {
            add_log("💻 Running in Local-only mode - starting local backend".to_string());
        }
    }

    // The guard hands the slot back if this start never publishes a child.
    let _reservation = match BACKEND_LIFECYCLE.reserve_start() {
        Ok(reservation) => reservation,
        Err(msg) => return Ok(msg),
    };

    // Use Tauri's resource API to find the bundled JRE and JAR
    let resource_dir = app.path().resource_dir().map_err(|e| {
        let error_msg = format!("❌ Failed to get resource directory: {}", e);
        add_log(error_msg.clone());
        error_msg
    })?;

    add_log(format!("🔍 Resource directory: {:?}", resource_dir));

    // Find the bundled JRE
    let java_executable = find_bundled_jre(&resource_dir)?;

    // Find the Stirling-PDF JAR
    let jar_path = find_stirling_jar(&resource_dir)?;

    // Normalize the paths to remove Windows UNC prefix
    let normalized_java_path = normalize_path(&java_executable);
    let normalized_jar_path = normalize_path(&jar_path);

    add_log(format!("📦 Found JAR file: {:?}", jar_path));
    add_log(format!("📦 Normalized JAR path: {:?}", normalized_jar_path));
    add_log(format!(
        "📦 Normalized Java path: {:?}",
        normalized_java_path
    ));

    // Create and start the Java command
    run_stirling_pdf_jar(&app, &normalized_java_path, &normalized_jar_path)?;

    add_log("✅ Backend startup sequence completed".to_string());

    Ok("Backend startup initiated successfully with bundled JRE".to_string())
}

// Get the dynamically assigned backend port
#[tauri::command]
pub fn get_backend_port() -> Option<u16> {
    let port_guard = BACKEND_PORT.lock().unwrap();
    *port_guard
}

// How long the backend gets to stop on its own before it is killed.
const BACKEND_STOP_GRACE: Duration = Duration::from_secs(10);
/// How long a kill gets to be confirmed by the termination notification.
const BACKEND_KILL_GRACE: Duration = Duration::from_secs(5);
/// How long the shutdown waits for a start that is still resolving. Past this,
/// the backend's own TAURI_PARENT_PID watchdog ends any child it spawns.
const BACKEND_START_GRACE: Duration = Duration::from_secs(30);
const BACKEND_STOP_POLL: Duration = Duration::from_millis(50);

/// How a backend stopped.
#[derive(Debug, PartialEq, Eq)]
pub enum BackendStop {
    /// It had already exited before the stop was requested.
    AlreadyExited,
    /// It exited inside the grace window.
    Graceful,
    /// It was killed and the termination notification confirmed the exit.
    Killed,
    /// The kill call failed.
    KillFailed(String),
    /// The kill was sent but no termination notification arrived.
    TerminationUnconfirmed,
}

/// Result of one backend stop, carrying the errors that did not stop it.
#[derive(Debug, PartialEq, Eq)]
struct ShutdownOutcome {
    stop: BackendStop,
    marker_error: Option<String>,
}

impl ShutdownOutcome {
    /// True only for outcomes that prove the process is gone.
    fn confirmed(&self) -> bool {
        matches!(
            self.stop,
            BackendStop::AlreadyExited | BackendStop::Graceful | BackendStop::Killed
        )
    }
}

/// Waits for the instance's termination notification. That notification is the
/// only proof the process exited: `kill` implementations differ on whether they
/// wait for it.
fn wait_for_exit(exited: &AtomicBool, deadline: Instant, poll: Duration) -> bool {
    while !exited.load(Ordering::Acquire) && Instant::now() < deadline {
        std::thread::sleep(poll);
    }
    exited.load(Ordering::Acquire)
}

/// Asks the backend to stop, waits for it, and kills it if it does not.
///
/// The deadline covers the whole stop, marker write included. A kill only
/// counts once the notification confirms it, so this never depends on whether
/// the plugin's kill waits.
fn shutdown_backend<P: BackendProcess>(
    instance: BackendInstance<P>,
    grace: Duration,
    kill_grace: Duration,
    poll: Duration,
) -> ShutdownOutcome {
    if instance.exited.load(Ordering::Acquire) {
        return ShutdownOutcome {
            stop: BackendStop::AlreadyExited,
            marker_error: None,
        };
    }

    let deadline = Instant::now() + grace;
    let marker_error = match std::fs::write(&instance.shutdown_file, b"stop") {
        Ok(()) => None,
        Err(error) => Some(format!(
            "could not write shutdown file {}: {}",
            instance.shutdown_file.display(),
            error
        )),
    };

    if wait_for_exit(&instance.exited, deadline, poll) {
        return ShutdownOutcome {
            stop: BackendStop::Graceful,
            marker_error,
        };
    }

    let pid = instance.process.pid();
    let kill_error = instance
        .process
        .kill()
        .err()
        .map(|error| format!("kill of PID {} failed: {}", pid, error));
    let confirmed = wait_for_exit(&instance.exited, Instant::now() + kill_grace, poll);
    let stop = match (kill_error, confirmed) {
        (Some(error), _) => BackendStop::KillFailed(error),
        (None, true) => BackendStop::Killed,
        (None, false) => BackendStop::TerminationUnconfirmed,
    };
    ShutdownOutcome { stop, marker_error }
}

fn log_shutdown(pid: u32, outcome: &ShutdownOutcome) {
    if let Some(error) = outcome.marker_error.as_deref() {
        add_log(format!("⚠️ {}", error));
    }
    match &outcome.stop {
        BackendStop::AlreadyExited => add_log(format!("Backend (PID: {}) had already exited", pid)),
        BackendStop::Graceful => add_log(format!("Backend (PID: {}) stopped gracefully", pid)),
        BackendStop::Killed => add_log(format!(
            "Backend (PID: {}) did not stop in time, killing",
            pid
        )),
        BackendStop::KillFailed(error) => add_log(format!("❌ {}", error)),
        BackendStop::TerminationUnconfirmed => add_log(format!(
            "⚠️ Backend (PID: {}) was killed but its exit was not confirmed",
            pid
        )),
    }
}

/// What [`stop_backend`] achieved. A quit may be best effort; a restart cannot
/// claim the backend is gone without `confirmed_stopped`.
pub struct StopReport {
    pub confirmed_stopped: bool,
    /// `None` when nothing was running or a pending start never resolved.
    pub stop: Option<BackendStop>,
}

/// Commits shutdown and stops the backend, waiting out a start that has not
/// published yet. Blocks until the process is gone or the grace window expires;
/// called from the shutdown worker, never from the event loop.
pub fn stop_backend() -> StopReport {
    match BACKEND_LIFECYCLE.take_for_shutdown(BACKEND_START_GRACE) {
        TakeOutcome::Nothing => StopReport {
            confirmed_stopped: true,
            stop: None,
        },
        TakeOutcome::StartUnresolved => {
            add_log("⚠️ Backend startup did not finish before the exit".to_string());
            StopReport {
                confirmed_stopped: false,
                stop: None,
            }
        }
        TakeOutcome::Backend(instance) => {
            let pid = instance.process.pid();
            add_log(format!(
                "App shutting down, stopping backend (PID: {})",
                pid
            ));
            let outcome = shutdown_backend(
                instance,
                BACKEND_STOP_GRACE,
                BACKEND_KILL_GRACE,
                BACKEND_STOP_POLL,
            );
            log_shutdown(pid, &outcome);
            StopReport {
                confirmed_stopped: outcome.confirmed(),
                stop: Some(outcome.stop),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{find_stirling_jar, version_key};

    #[test]
    fn version_key_orders_numerically_not_lexically() {
        let mut names = [
            "stirling-pdf-2.9.0.jar",
            "stirling-pdf-3.9.0.jar",
            "stirling-pdf-3.10.0.jar",
            "stirling-pdf-2.14.2.jar",
        ];
        names.sort_by_key(|name| std::cmp::Reverse(version_key(name)));
        assert_eq!(
            names,
            [
                "stirling-pdf-3.10.0.jar",
                "stirling-pdf-3.9.0.jar",
                "stirling-pdf-2.14.2.jar",
                "stirling-pdf-2.9.0.jar",
            ]
        );
    }

    #[test]
    fn version_key_ranks_prereleases_below_the_release() {
        assert!(
            version_key("stirling-pdf-3.0.0-SNAPSHOT.jar") < version_key("stirling-pdf-3.0.0.jar")
        );
        assert!(version_key("stirling-pdf-3.0.0-rc1.jar") < version_key("stirling-pdf-3.0.0.jar"));
        assert!(
            version_key("stirling-pdf-3.0.0-rc1.jar") < version_key("stirling-pdf-3.0.0-rc2.jar")
        );

        let mut names = [
            "stirling-pdf-3.0.0-rc1.jar",
            "stirling-pdf-3.0.0.jar",
            "stirling-pdf-3.0.0-rc2.jar",
            "stirling-pdf-2.14.3.jar",
        ];
        names.sort_by_key(|name| std::cmp::Reverse(version_key(name)));
        assert_eq!(
            names,
            [
                "stirling-pdf-3.0.0.jar",
                "stirling-pdf-3.0.0-rc2.jar",
                "stirling-pdf-3.0.0-rc1.jar",
                "stirling-pdf-2.14.3.jar",
            ]
        );
    }

    #[test]
    fn version_key_orders_prerelease_numbers_numerically() {
        assert!(
            version_key("stirling-pdf-3.0.0-rc2.jar") < version_key("stirling-pdf-3.0.0-rc10.jar")
        );

        let mut names = [
            "stirling-pdf-3.0.0-rc10.jar",
            "stirling-pdf-3.0.0-rc2.jar",
            "stirling-pdf-3.0.0-rc1.jar",
        ];
        names.sort_by_key(|name| std::cmp::Reverse(version_key(name)));
        assert_eq!(
            names,
            [
                "stirling-pdf-3.0.0-rc10.jar",
                "stirling-pdf-3.0.0-rc2.jar",
                "stirling-pdf-3.0.0-rc1.jar",
            ]
        );
    }

    #[test]
    fn version_key_tolerates_non_numeric_versions() {
        let key = version_key("not-a-version.jar");
        assert_eq!(key.0, vec![0]);
        assert_eq!(key.1, 0);
        assert_eq!(version_key("stirling-pdf-3.0.0.jar").1, 1);
    }

    #[test]
    fn version_key_parses_the_token_anywhere_in_the_name() {
        // find_stirling_jar accepts any name containing "stirling-pdf", so a
        // prefixed build must still yield a real version rather than 0.
        assert!(
            version_key("stirling-pdf-3.9.0.jar") < version_key("vendor-stirling-pdf-3.10.0.jar")
        );

        let mut names = ["vendor-stirling-pdf-3.10.0.jar", "stirling-pdf-3.9.0.jar"];
        names.sort_by_key(|name| std::cmp::Reverse(version_key(name)));
        assert_eq!(
            names,
            ["vendor-stirling-pdf-3.10.0.jar", "stirling-pdf-3.9.0.jar"]
        );
    }

    #[test]
    fn version_key_ranks_snapshot_below_release_candidates() {
        // A development SNAPSHOT must never outrank a validated release candidate.
        assert!(
            version_key("stirling-pdf-3.0.0-SNAPSHOT.jar")
                < version_key("stirling-pdf-3.0.0-rc1.jar")
        );
        assert!(
            version_key("stirling-pdf-3.0.0-alpha1.jar")
                < version_key("stirling-pdf-3.0.0-beta1.jar")
        );
        assert!(
            version_key("stirling-pdf-3.0.0-beta1.jar") < version_key("stirling-pdf-3.0.0-rc1.jar")
        );

        let mut names = [
            "stirling-pdf-3.0.0-SNAPSHOT.jar",
            "stirling-pdf-3.0.0-rc1.jar",
            "stirling-pdf-3.0.0.jar",
        ];
        names.sort_by_key(|name| std::cmp::Reverse(version_key(name)));
        assert_eq!(
            names,
            [
                "stirling-pdf-3.0.0.jar",
                "stirling-pdf-3.0.0-rc1.jar",
                "stirling-pdf-3.0.0-SNAPSHOT.jar",
            ]
        );
    }

    #[test]
    fn find_stirling_jar_prefers_release_candidate_over_snapshot() {
        let dir = std::env::temp_dir().join(format!("stirling-jar-select-{}", std::process::id()));
        let libs = dir.join("libs");
        std::fs::create_dir_all(&libs).unwrap();
        std::fs::write(libs.join("stirling-pdf-3.0.0-SNAPSHOT.jar"), b"").unwrap();
        std::fs::write(libs.join("stirling-pdf-3.0.0-rc1.jar"), b"").unwrap();

        let selected = find_stirling_jar(&dir).unwrap();

        assert_eq!(selected.file_name().unwrap(), "stirling-pdf-3.0.0-rc1.jar");
        let _ = std::fs::remove_dir_all(&dir);
    }

    use super::{
        shutdown_backend, BackendInstance, BackendLifecycle, BackendProcess, BackendSlot,
        BackendStop, ShutdownOutcome, TakeOutcome,
    };
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::sync::Arc;
    use std::time::Duration;

    /// Test process: records or refuses the kill and can raise the termination
    /// notification.
    struct TestProcess {
        killed: Arc<AtomicBool>,
        fail_kill: bool,
        exits_on_kill: Option<Arc<AtomicBool>>,
    }

    impl BackendProcess for TestProcess {
        fn pid(&self) -> u32 {
            4242
        }

        fn kill(self) -> std::io::Result<()> {
            if self.fail_kill {
                return Err(std::io::Error::other("kill refused"));
            }
            self.killed.store(true, Ordering::Release);
            if let Some(exited) = self.exits_on_kill {
                exited.store(true, Ordering::Release);
            }
            Ok(())
        }
    }

    const TEST_POLL: Duration = Duration::from_millis(5);
    const TEST_GRACE: Duration = Duration::from_secs(5);

    fn lifecycle() -> BackendLifecycle<TestProcess> {
        BackendLifecycle::new()
    }

    fn test_instance(
        shutdown_file: PathBuf,
        exited: Arc<AtomicBool>,
        killed: Arc<AtomicBool>,
    ) -> BackendInstance<TestProcess> {
        BackendInstance {
            process: TestProcess {
                killed,
                fail_kill: false,
                exits_on_kill: Some(exited.clone()),
            },
            shutdown_file,
            exited,
        }
    }

    fn temp_path(name: &str) -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(name);
        (dir, path)
    }

    #[test]
    fn reserve_start_takes_an_empty_slot() {
        let backend = lifecycle();
        let reservation = backend.reserve_start();
        assert!(reservation.is_ok());
        assert!(matches!(
            *backend.slot.lock().unwrap(),
            BackendSlot::Starting
        ));
    }

    #[test]
    fn reserve_start_refuses_a_second_start() {
        let backend = lifecycle();
        let _reservation = backend.reserve_start().unwrap();
        assert_eq!(
            backend.reserve_start().err(),
            Some("Backend startup already in progress".to_string())
        );
    }

    #[test]
    fn reserve_start_refuses_while_a_backend_runs() {
        let backend = lifecycle();
        let _reservation = backend.reserve_start().unwrap();
        let (_dir, marker) = temp_path("backend.stop");
        let instance = test_instance(
            marker,
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicBool::new(false)),
        );
        backend.register_backend(instance);

        assert_eq!(
            backend.reserve_start().err(),
            Some("Backend already running".to_string())
        );
    }

    #[test]
    fn reserve_start_refuses_once_shutdown_committed() {
        let backend = lifecycle();
        assert!(matches!(
            backend.take_for_shutdown(TEST_GRACE),
            TakeOutcome::Nothing
        ));
        assert_eq!(
            backend.reserve_start().err(),
            Some("Backend is shutting down".to_string())
        );
    }

    /// Shutdown must not finish while a start is still resolving, and must take
    /// the child that start publishes.
    #[test]
    fn shutdown_waits_for_a_start_that_has_not_published_yet() {
        let backend = Arc::new(lifecycle());
        let reservation = backend.reserve_start().unwrap();

        let (started_tx, started_rx) = mpsc::channel();
        let (taken_tx, taken_rx) = mpsc::channel();
        let worker = {
            let backend = backend.clone();
            std::thread::spawn(move || {
                started_tx.send(()).unwrap();
                taken_tx
                    .send(backend.take_for_shutdown(TEST_GRACE))
                    .unwrap();
            })
        };
        started_rx.recv().unwrap();

        assert!(
            matches!(
                taken_rx.recv_timeout(Duration::from_millis(50)),
                Err(mpsc::RecvTimeoutError::Timeout)
            ),
            "shutdown finished before the start published"
        );

        let (_dir, marker) = temp_path("backend.stop");
        let exited = Arc::new(AtomicBool::new(false));
        let killed = Arc::new(AtomicBool::new(false));
        backend.register_backend(test_instance(marker, exited, killed));

        match taken_rx.recv_timeout(TEST_GRACE).unwrap() {
            TakeOutcome::Backend(instance) => assert_eq!(instance.process.pid(), 4242),
            _ => panic!("shutdown did not take the published backend"),
        }
        drop(reservation);
        worker.join().unwrap();
    }

    /// A start that fails hands the slot back, which lets the shutdown finish.
    #[test]
    fn shutdown_finishes_when_a_pending_start_releases_the_slot() {
        let backend = Arc::new(lifecycle());
        let reservation = backend.reserve_start().unwrap();

        let (started_tx, started_rx) = mpsc::channel();
        let (taken_tx, taken_rx) = mpsc::channel();
        let worker = {
            let backend = backend.clone();
            std::thread::spawn(move || {
                started_tx.send(()).unwrap();
                taken_tx
                    .send(backend.take_for_shutdown(TEST_GRACE))
                    .unwrap();
            })
        };
        started_rx.recv().unwrap();
        assert!(matches!(
            taken_rx.recv_timeout(Duration::from_millis(50)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));

        drop(reservation);

        assert!(matches!(
            taken_rx.recv_timeout(TEST_GRACE).unwrap(),
            TakeOutcome::Nothing
        ));
        worker.join().unwrap();
    }

    #[test]
    fn take_for_shutdown_gives_up_on_a_start_that_never_resolves() {
        let backend = lifecycle();
        let _reservation = backend.reserve_start().unwrap();
        assert!(matches!(
            backend.take_for_shutdown(Duration::from_millis(20)),
            TakeOutcome::StartUnresolved
        ));
        assert!(backend.shutdown_committed());
    }

    #[test]
    fn an_unpublished_start_hands_the_slot_back() {
        let backend = lifecycle();
        drop(backend.reserve_start().unwrap());
        assert!(matches!(*backend.slot.lock().unwrap(), BackendSlot::Empty));

        let _reservation = backend.reserve_start().unwrap();
        assert!(matches!(
            *backend.slot.lock().unwrap(),
            BackendSlot::Starting
        ));
    }

    #[test]
    fn a_published_backend_survives_the_start_guard() {
        let backend = lifecycle();
        let reservation = backend.reserve_start().unwrap();
        let (_dir, marker) = temp_path("backend.stop");
        let instance = test_instance(
            marker,
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicBool::new(false)),
        );
        backend.register_backend(instance);

        drop(reservation);

        assert!(matches!(
            *backend.slot.lock().unwrap(),
            BackendSlot::Running(_)
        ));
    }

    #[test]
    fn a_monitor_only_retires_its_own_backend() {
        let backend = lifecycle();
        let _reservation = backend.reserve_start().unwrap();
        let (_dir, marker) = temp_path("backend.stop");
        let exited = Arc::new(AtomicBool::new(false));
        let instance = test_instance(marker, exited.clone(), Arc::new(AtomicBool::new(false)));
        backend.register_backend(instance);

        // A stale monitor for a previous backend must not clear this one.
        backend.retire(&Arc::new(AtomicBool::new(true)));
        assert!(matches!(
            *backend.slot.lock().unwrap(),
            BackendSlot::Running(_)
        ));

        backend.retire(&exited);
        assert!(matches!(*backend.slot.lock().unwrap(), BackendSlot::Empty));
    }

    #[test]
    fn shutdown_returns_at_once_for_a_backend_that_already_exited() {
        let (_dir, marker) = temp_path("backend.stop");
        let killed = Arc::new(AtomicBool::new(false));
        let instance = test_instance(
            marker.clone(),
            Arc::new(AtomicBool::new(true)),
            killed.clone(),
        );

        let outcome = shutdown_backend(instance, TEST_GRACE, TEST_GRACE, TEST_POLL);

        assert_eq!(outcome.stop, BackendStop::AlreadyExited);
        assert_eq!(outcome.marker_error, None);
        assert!(!killed.load(Ordering::Acquire));
        assert!(!marker.exists(), "an exited backend needs no marker");
    }

    #[test]
    fn shutdown_writes_the_marker_and_observes_a_graceful_stop() {
        let (_dir, marker) = temp_path("backend.stop");
        let killed = Arc::new(AtomicBool::new(false));
        let exited = Arc::new(AtomicBool::new(false));
        let instance = test_instance(marker.clone(), exited.clone(), killed.clone());

        let backend = std::thread::spawn(move || {
            while !marker.exists() {
                std::thread::sleep(Duration::from_millis(5));
            }
            exited.store(true, Ordering::Release);
        });

        let outcome = shutdown_backend(instance, TEST_GRACE, TEST_GRACE, TEST_POLL);
        backend.join().unwrap();

        assert_eq!(outcome.stop, BackendStop::Graceful);
        assert_eq!(outcome.marker_error, None);
        assert!(!killed.load(Ordering::Acquire), "no kill for a clean stop");
    }

    #[test]
    fn shutdown_kills_a_backend_that_ignores_the_marker() {
        let (_dir, marker) = temp_path("backend.stop");
        let killed = Arc::new(AtomicBool::new(false));
        let instance = test_instance(
            marker.clone(),
            Arc::new(AtomicBool::new(false)),
            killed.clone(),
        );

        let outcome = shutdown_backend(instance, Duration::from_millis(50), TEST_GRACE, TEST_POLL);

        assert_eq!(outcome.stop, BackendStop::Killed);
        assert!(killed.load(Ordering::Acquire));
        assert_eq!(std::fs::read(&marker).unwrap(), b"stop");
    }

    #[test]
    fn shutdown_reports_a_marker_write_failure_and_still_kills() {
        let dir = tempfile::tempdir().unwrap();
        let unwritable = dir.path().join("missing-dir").join("backend.stop");
        let killed = Arc::new(AtomicBool::new(false));
        let instance = test_instance(unwritable, Arc::new(AtomicBool::new(false)), killed.clone());

        let outcome = shutdown_backend(instance, Duration::from_millis(50), TEST_GRACE, TEST_POLL);

        assert_eq!(outcome.stop, BackendStop::Killed);
        assert!(killed.load(Ordering::Acquire), "the fallback still runs");
        assert!(
            outcome
                .marker_error
                .as_deref()
                .is_some_and(|error| error.contains("could not write shutdown file")),
            "the write failure must be reported: {:?}",
            outcome.marker_error
        );
    }

    #[test]
    fn shutdown_reports_a_failed_kill() {
        let (_dir, marker) = temp_path("backend.stop");
        let mut instance = test_instance(
            marker,
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicBool::new(false)),
        );
        instance.process.fail_kill = true;

        let outcome = shutdown_backend(instance, Duration::from_millis(50), TEST_GRACE, TEST_POLL);

        match outcome.stop {
            BackendStop::KillFailed(error) => {
                assert!(
                    error.contains("4242"),
                    "the PID must be in the error: {error}"
                );
                assert!(error.contains("kill refused"));
            }
            other => panic!("expected KillFailed, got {other:?}"),
        }
    }

    #[test]
    fn shutdown_reports_an_unconfirmed_kill() {
        let (_dir, marker) = temp_path("backend.stop");
        let exited = Arc::new(AtomicBool::new(false));
        let killed = Arc::new(AtomicBool::new(false));
        let mut instance = test_instance(marker, exited, killed.clone());
        // The kill lands, but nothing raises the termination notification.
        instance.process.exits_on_kill = None;

        let outcome = shutdown_backend(
            instance,
            Duration::from_millis(50),
            Duration::from_millis(50),
            TEST_POLL,
        );

        assert_eq!(outcome.stop, BackendStop::TerminationUnconfirmed);
        assert!(!outcome.confirmed(), "no notification, no proof");
        assert!(killed.load(Ordering::Acquire));
    }

    #[test]
    fn only_observed_termination_counts_as_confirmed() {
        for (stop, confirmed) in [
            (BackendStop::AlreadyExited, true),
            (BackendStop::Graceful, true),
            (BackendStop::Killed, true),
            (BackendStop::KillFailed("kill refused".to_string()), false),
            (BackendStop::TerminationUnconfirmed, false),
        ] {
            let outcome = ShutdownOutcome {
                stop,
                marker_error: None,
            };
            assert_eq!(outcome.confirmed(), confirmed, "{outcome:?}");
        }
    }

    /// Real-process coverage, kept in its own module so nothing Unix-only is
    /// compiled (or left unused) on Windows.
    #[cfg(unix)]
    mod subprocess_tests {
        use super::*;
        use std::sync::Mutex;
        use std::time::Instant;

        /// A real child shared with the watcher, so killing and reaping both stay
        /// possible.
        struct SpawnedProcess {
            child: Arc<Mutex<std::process::Child>>,
        }

        impl BackendProcess for SpawnedProcess {
            fn pid(&self) -> u32 {
                self.child.lock().unwrap().id()
            }

            fn kill(self) -> std::io::Result<()> {
                let mut child = self.child.lock().unwrap();
                if child.try_wait()?.is_none() {
                    child.kill()?;
                }
                Ok(())
            }
        }

        impl Drop for SpawnedProcess {
            fn drop(&mut self) {
                let mut child = self.child.lock().unwrap();
                if child.try_wait().ok().flatten().is_none() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }

        /// Runs `script` with `$1`, `$2` … bound to `args`, so no path is ever
        /// interpolated into shell source.
        fn spawn_shell(script: &str, args: &[&str]) -> std::process::Child {
            let mut command = std::process::Command::new("sh");
            command.arg("-c").arg(script).arg("sh");
            command.args(args);
            command.spawn().expect("the test needs a POSIX shell")
        }

        /// Stands in for the output monitor: reaps the child and only then raises
        /// the termination notification. Returns false when it gave up.
        fn watch(
            child: Arc<Mutex<std::process::Child>>,
            exited: Arc<AtomicBool>,
            exit_status: Arc<Mutex<Option<std::process::ExitStatus>>>,
        ) -> std::thread::JoinHandle<bool> {
            std::thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(30);
                loop {
                    match child.lock().unwrap().try_wait() {
                        Ok(Some(status)) => {
                            *exit_status.lock().unwrap() = Some(status);
                            exited.store(true, Ordering::Release);
                            return true;
                        }
                        Ok(None) if Instant::now() < deadline => {
                            std::thread::sleep(TEST_POLL);
                        }
                        _ => return false,
                    }
                }
            })
        }

        #[test]
        fn shutdown_follows_a_real_backend_that_watches_the_marker() {
            let (_dir, marker) = temp_path("backend.stop");
            let child = spawn_shell(
                "until [ -f \"$1\" ]; do sleep 0.05; done",
                &[marker.to_str().unwrap()],
            );
            let child = Arc::new(Mutex::new(child));
            let exited = Arc::new(AtomicBool::new(false));
            let status = Arc::new(Mutex::new(None));
            let watcher = watch(child.clone(), exited.clone(), status.clone());
            let instance = BackendInstance {
                process: SpawnedProcess { child },
                shutdown_file: marker,
                exited,
            };

            let outcome = shutdown_backend(instance, TEST_GRACE, TEST_GRACE, TEST_POLL);

            assert!(watcher.join().unwrap(), "the watcher reaped the process");
            assert_eq!(outcome.stop, BackendStop::Graceful, "{outcome:?}");
            let status = status.lock().unwrap().expect("exit status recorded");
            assert!(status.success(), "the backend exited cleanly: {status:?}");
        }

        #[test]
        fn shutdown_kills_a_real_backend_that_ignores_the_marker() {
            let (_dir, marker) = temp_path("backend.stop");
            let child = spawn_shell("exec sleep 30", &[]);
            let child = Arc::new(Mutex::new(child));
            let exited = Arc::new(AtomicBool::new(false));
            let status = Arc::new(Mutex::new(None));
            let watcher = watch(child.clone(), exited.clone(), status.clone());
            let instance = BackendInstance {
                process: SpawnedProcess { child },
                shutdown_file: marker.clone(),
                exited,
            };

            let outcome =
                shutdown_backend(instance, Duration::from_millis(200), TEST_GRACE, TEST_POLL);

            assert!(watcher.join().unwrap(), "the watcher reaped the process");
            assert_eq!(outcome.stop, BackendStop::Killed, "{outcome:?}");
            let status = status.lock().unwrap().expect("exit status recorded");
            assert!(
                !status.success(),
                "the forced stop ends the process: {status:?}"
            );
            assert_eq!(std::fs::read(&marker).unwrap(), b"stop");
        }
    }
}
