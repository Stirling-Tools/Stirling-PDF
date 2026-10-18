use crate::state::connection_state::{AppConnectionState, ConnectionMode};
use crate::utils::{add_log, app_data_dir};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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

// Backend lifecycle slot and port, shared by the commands and the exit path.
static BACKEND_SLOT: Mutex<BackendSlot> = Mutex::new(BackendSlot::Empty);
static BACKEND_PORT: Mutex<Option<u16>> = Mutex::new(None);

/// The one slot a backend occupies. `Stopping` is terminal: once shutdown has
/// committed, no start may register a backend.
enum BackendSlot<P: BackendProcess = CommandChild> {
    Empty,
    Starting,
    Running(BackendInstance<P>),
    Stopping,
}

/// Stops one backend process. Production uses `CommandChild`; the trait is the
/// seam that lets tests drive a fake or a real child process.
trait BackendProcess: Send + 'static {
    fn pid(&self) -> u32;
    /// Sends a kill signal and waits for the process to exit.
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

/// Reserves the slot for a start.
fn reserve_start<P: BackendProcess>(slot: &mut BackendSlot<P>) -> Result<(), String> {
    match slot {
        BackendSlot::Empty => {
            *slot = BackendSlot::Starting;
            Ok(())
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

/// Returns the slot to `Empty` when a start never reached registration.
fn release_start<P: BackendProcess>(slot: &mut BackendSlot<P>) {
    if matches!(slot, BackendSlot::Starting) {
        *slot = BackendSlot::Empty;
    }
}

fn release_start_reservation() {
    release_start(&mut BACKEND_SLOT.lock().unwrap());
}

/// Registers a spawned backend. Hands the instance back when shutdown committed
/// while the backend was spawning, so the caller can stop it.
fn register_backend<P: BackendProcess>(
    slot: &mut BackendSlot<P>,
    instance: BackendInstance<P>,
) -> Result<(), (String, BackendInstance<P>)> {
    match slot {
        BackendSlot::Starting => {
            *slot = BackendSlot::Running(instance);
            Ok(())
        }
        _ => Err((
            "Backend shutdown already started, refusing to register".to_string(),
            instance,
        )),
    }
}

/// Commits shutdown and takes the backend out of the slot. The slot stays
/// `Stopping`, so a start racing the exit cannot register a new backend.
fn begin_shutdown<P: BackendProcess>(slot: &mut BackendSlot<P>) -> Option<BackendInstance<P>> {
    match std::mem::replace(slot, BackendSlot::Stopping) {
        BackendSlot::Running(instance) => Some(instance),
        _ => None,
    }
}

/// Clears the slot for the backend whose monitor raised `exited`. A monitor
/// must never retire a backend that replaced it.
fn retire_backend<P: BackendProcess>(slot: &mut BackendSlot<P>, exited: &Arc<AtomicBool>) {
    if let BackendSlot::Running(instance) = slot {
        if Arc::ptr_eq(&instance.exited, exited) {
            *slot = BackendSlot::Empty;
        }
    }
}

fn check_backend_status() -> Result<(), String> {
    reserve_start(&mut BACKEND_SLOT.lock().unwrap())
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
        .current_dir(&work_dir)  // Set working directory to writable location
        .env("TAURI_PARENT_PID", std::process::id().to_string())
        .env("STIRLING_PDF_CONFIG_DIR", config_dir.to_str().unwrap())
        .env("STIRLING_PDF_LOG_DIR", log_dir.to_str().unwrap())
        .env("STIRLING_PDF_WORK_DIR", work_dir.to_str().unwrap())
        .env("STIRLING_PDF_SHUTDOWN_FILE", shutdown_file.to_str().unwrap());

    add_log("⚙️ Starting backend with bundled JRE...".to_string());

    let (rx, child) = sidecar_command
        .spawn()
        .map_err(|e| {
            // Nothing registered, so the reservation has to go back.
            release_start_reservation();
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

    if let Err((message, instance)) =
        register_backend(&mut BACKEND_SLOT.lock().unwrap(), instance)
    {
        // Shutdown committed while the sidecar was spawning: stop it now, or it
        // outlives the app.
        add_log(format!("⚠️ {}; stopping the backend just started", message));
        if let Err(error) = instance.process.kill() {
            add_log(format!(
                "❌ Failed to kill the backend started during shutdown: {}",
                error
            ));
        }
        return Err(message);
    }

    add_log("✅ Backend started with bundled JRE, monitoring output...".to_string());

    // Start monitoring output
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
                    retire_backend(&mut BACKEND_SLOT.lock().unwrap(), &exited);
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

    // Check if backend is already running or starting
    if let Err(msg) = check_backend_status() {
        return Ok(msg);
    }

    // Use Tauri's resource API to find the bundled JRE and JAR
    let resource_dir = app.path().resource_dir().map_err(|e| {
        let error_msg = format!("❌ Failed to get resource directory: {}", e);
        add_log(error_msg.clone());
        release_start_reservation();
        error_msg
    })?;

    add_log(format!("🔍 Resource directory: {:?}", resource_dir));

    // Find the bundled JRE
    let java_executable = find_bundled_jre(&resource_dir).map_err(|e| {
        release_start_reservation();
        e
    })?;

    // Find the Stirling-PDF JAR
    let jar_path = find_stirling_jar(&resource_dir).map_err(|e| {
        release_start_reservation();
        e
    })?;

    // Normalize the paths to remove Windows UNC prefix
    let normalized_java_path = normalize_path(&java_executable);
    let normalized_jar_path = normalize_path(&jar_path);

    add_log(format!("📦 Found JAR file: {:?}", jar_path));
    add_log(format!("📦 Normalized JAR path: {:?}", normalized_jar_path));
    add_log(format!("📦 Normalized Java path: {:?}", normalized_java_path));

    // Create and start the Java command
    run_stirling_pdf_jar(&app, &normalized_java_path, &normalized_jar_path).map_err(|e| {
        release_start_reservation();
        e
    })?;

    // Clears the reservation when a start failed without releasing it.
    release_start_reservation();
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
const BACKEND_STOP_POLL: Duration = Duration::from_millis(50);

/// How a backend stopped.
#[derive(Debug, PartialEq, Eq)]
enum BackendStop {
    /// It had already exited before the stop was requested.
    AlreadyExited,
    /// It exited inside the grace window.
    Graceful,
    /// It ignored the marker and was killed.
    Killed,
    /// The kill call itself failed.
    KillFailed(String),
}

/// Result of one backend stop, carrying the errors that did not stop it.
#[derive(Debug, PartialEq, Eq)]
struct ShutdownOutcome {
    stop: BackendStop,
    marker_error: Option<String>,
}

/// Asks the backend to stop, waits for it, and kills it if it does not.
///
/// The deadline covers the whole stop, marker write included. `Killed` means
/// the kill call returned: the shell plugin's kill waits for the process to
/// exit, so nothing here is bounded by `grace` alone.
fn shutdown_backend<P: BackendProcess>(
    instance: BackendInstance<P>,
    grace: Duration,
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

    while !instance.exited.load(Ordering::Acquire) && Instant::now() < deadline {
        std::thread::sleep(poll);
    }

    if instance.exited.load(Ordering::Acquire) {
        return ShutdownOutcome {
            stop: BackendStop::Graceful,
            marker_error,
        };
    }

    let pid = instance.process.pid();
    let stop = match instance.process.kill() {
        Ok(()) => BackendStop::Killed,
        Err(error) => BackendStop::KillFailed(format!("kill of PID {} failed: {}", pid, error)),
    };
    ShutdownOutcome { stop, marker_error }
}

/// Logs what the stop did; the marker and kill errors each get a line.
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
    }
}

/// Commits shutdown and stops the backend, blocking until it is gone or the
/// grace window expires. Called from the shutdown worker, never from the event
/// loop.
pub fn stop_backend() {
    let Some(instance) = begin_shutdown(&mut BACKEND_SLOT.lock().unwrap()) else {
        return;
    };
    let pid = instance.process.pid();
    add_log(format!(
        "App shutting down, stopping backend (PID: {})",
        pid
    ));
    let outcome = shutdown_backend(instance, BACKEND_STOP_GRACE, BACKEND_STOP_POLL);
    log_shutdown(pid, &outcome);
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
        begin_shutdown, register_backend, release_start, reserve_start, retire_backend,
        shutdown_backend, BackendInstance, BackendProcess, BackendSlot, BackendStop,
    };
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    /// A process the tests control: it records the kill and can refuse it.
    struct TestProcess {
        killed: Arc<AtomicBool>,
        fail_kill: bool,
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
            Ok(())
        }
    }

    const TEST_POLL: Duration = Duration::from_millis(5);

    fn test_instance(
        shutdown_file: PathBuf,
        exited: Arc<AtomicBool>,
        killed: Arc<AtomicBool>,
    ) -> BackendInstance<TestProcess> {
        BackendInstance {
            process: TestProcess {
                killed,
                fail_kill: false,
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
        let mut slot = BackendSlot::<TestProcess>::Empty;
        assert!(reserve_start(&mut slot).is_ok());
        assert!(matches!(slot, BackendSlot::Starting));
    }

    #[test]
    fn reserve_start_refuses_a_second_start() {
        let mut slot = BackendSlot::<TestProcess>::Starting;
        assert_eq!(
            reserve_start(&mut slot),
            Err("Backend startup already in progress".to_string())
        );
    }

    #[test]
    fn reserve_start_refuses_while_a_backend_runs() {
        let mut slot = BackendSlot::<TestProcess>::Empty;
        let (_dir, marker) = temp_path("backend.stop");
        let exited = Arc::new(AtomicBool::new(false));
        let instance = test_instance(marker, exited.clone(), Arc::new(AtomicBool::new(false)));
        reserve_start(&mut slot).unwrap();
        assert!(register_backend(&mut slot, instance).is_ok());

        assert_eq!(
            reserve_start(&mut slot),
            Err("Backend already running".to_string())
        );
    }

    #[test]
    fn reserve_start_refuses_once_shutdown_committed() {
        let mut slot = BackendSlot::<TestProcess>::Stopping;
        assert_eq!(
            reserve_start(&mut slot),
            Err("Backend is shutting down".to_string())
        );
    }

    #[test]
    fn release_start_hands_an_unregistered_slot_back() {
        let mut slot = BackendSlot::<TestProcess>::Starting;
        release_start(&mut slot);
        assert!(matches!(slot, BackendSlot::Empty));
    }

    #[test]
    fn release_start_leaves_a_registered_backend_alone() {
        let mut slot = BackendSlot::<TestProcess>::Empty;
        let (_dir, marker) = temp_path("backend.stop");
        let instance = test_instance(
            marker,
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicBool::new(false)),
        );
        reserve_start(&mut slot).unwrap();
        assert!(register_backend(&mut slot, instance).is_ok());

        release_start(&mut slot);

        assert!(matches!(slot, BackendSlot::Running(_)));
    }

    #[test]
    fn register_backend_refuses_after_shutdown_and_hands_the_instance_back() {
        let mut slot = BackendSlot::<TestProcess>::Stopping;
        let (_dir, marker) = temp_path("backend.stop");
        let instance = test_instance(
            marker,
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicBool::new(false)),
        );

        let (message, returned) = register_backend(&mut slot, instance).unwrap_err();

        assert!(message.contains("refusing to register"));
        assert_eq!(returned.process.pid(), 4242);
        assert!(matches!(slot, BackendSlot::Stopping));
    }

    #[test]
    fn begin_shutdown_takes_the_backend_and_stays_committed() {
        let mut slot = BackendSlot::<TestProcess>::Empty;
        let (_dir, marker) = temp_path("backend.stop");
        let instance = test_instance(
            marker,
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicBool::new(false)),
        );
        reserve_start(&mut slot).unwrap();
        assert!(register_backend(&mut slot, instance).is_ok());

        let taken = begin_shutdown(&mut slot);
        assert_eq!(taken.map(|instance| instance.process.pid()), Some(4242));
        assert!(matches!(slot, BackendSlot::Stopping));
        assert!(begin_shutdown(&mut slot).is_none(), "idempotent");
    }

    #[test]
    fn begin_shutdown_commits_even_without_a_backend() {
        let mut slot = BackendSlot::<TestProcess>::Empty;
        assert!(begin_shutdown(&mut slot).is_none());
        assert_eq!(
            reserve_start(&mut slot),
            Err("Backend is shutting down".to_string()),
            "a start racing the exit must not register"
        );
    }

    #[test]
    fn a_monitor_only_retires_its_own_backend() {
        let mut slot = BackendSlot::<TestProcess>::Empty;
        let (_dir, marker) = temp_path("backend.stop");
        let exited = Arc::new(AtomicBool::new(false));
        let instance = test_instance(marker, exited.clone(), Arc::new(AtomicBool::new(false)));
        reserve_start(&mut slot).unwrap();
        assert!(register_backend(&mut slot, instance).is_ok());

        // A stale monitor for a previous backend must not clear this one.
        retire_backend(&mut slot, &Arc::new(AtomicBool::new(true)));
        assert!(matches!(slot, BackendSlot::Running(_)));

        retire_backend(&mut slot, &exited);
        assert!(matches!(slot, BackendSlot::Empty));
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

        let outcome = shutdown_backend(instance, Duration::from_secs(5), TEST_POLL);

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

        let outcome = shutdown_backend(instance, Duration::from_secs(5), TEST_POLL);
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

        let outcome = shutdown_backend(instance, Duration::from_millis(50), TEST_POLL);

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

        let outcome = shutdown_backend(instance, Duration::from_millis(50), TEST_POLL);

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

        let outcome = shutdown_backend(instance, Duration::from_millis(50), TEST_POLL);

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

    /// A real spawned process, keeping the handle so the test can prove that a
    /// forced stop waited for the process to exit.
    struct SpawnedProcess {
        child: std::process::Child,
        exit_status: Arc<Mutex<Option<std::process::ExitStatus>>>,
    }

    impl BackendProcess for SpawnedProcess {
        fn pid(&self) -> u32 {
            self.child.id()
        }

        fn kill(mut self) -> std::io::Result<()> {
            self.child.kill()?;
            // The shell plugin's kill waits for the process; mirror that so the
            // test can assert the process is really gone.
            let status = self.child.wait()?;
            *self.exit_status.lock().unwrap() = Some(status);
            Ok(())
        }
    }

    #[cfg(unix)]
    fn spawn_shell(script: &str) -> std::process::Child {
        std::process::Command::new("sh")
            .arg("-c")
            .arg(script)
            .spawn()
            .expect("the test needs a POSIX shell")
    }

    #[cfg(unix)]
    #[test]
    fn shutdown_follows_a_real_backend_that_watches_the_marker() {
        let (dir, marker) = temp_path("backend.stop");
        let proof = dir.path().join("exited");
        let script = format!(
            "while [ ! -f {} ]; do sleep 0.05; done; echo done > {}",
            marker.display(),
            proof.display()
        );
        let child = spawn_shell(&script);
        let exited = Arc::new(AtomicBool::new(false));
        let instance = BackendInstance {
            process: SpawnedProcess {
                child,
                exit_status: Arc::new(Mutex::new(None)),
            },
            shutdown_file: marker.clone(),
            exited: exited.clone(),
        };

        // The production monitor raises the flag on the termination event; here
        // the backend's own proof file stands in for it.
        let watcher = {
            let proof = proof.clone();
            let exited = exited.clone();
            std::thread::spawn(move || {
                while !proof.exists() {
                    std::thread::sleep(Duration::from_millis(5));
                }
                exited.store(true, Ordering::Release);
            })
        };

        let outcome = shutdown_backend(instance, Duration::from_secs(5), TEST_POLL);
        watcher.join().unwrap();

        assert_eq!(outcome.stop, BackendStop::Graceful, "{outcome:?}");
        assert!(proof.exists(), "the backend exited on its own");
    }

    #[cfg(unix)]
    #[test]
    fn shutdown_kills_a_real_backend_that_ignores_the_marker() {
        let (_dir, marker) = temp_path("backend.stop");
        let child = spawn_shell("sleep 30");
        let exit_status = Arc::new(Mutex::new(None));
        let instance = BackendInstance {
            process: SpawnedProcess {
                child,
                exit_status: exit_status.clone(),
            },
            shutdown_file: marker.clone(),
            exited: Arc::new(AtomicBool::new(false)),
        };

        let outcome = shutdown_backend(instance, Duration::from_millis(200), TEST_POLL);

        assert_eq!(outcome.stop, BackendStop::Killed, "{outcome:?}");
        assert!(
            exit_status.lock().unwrap().is_some(),
            "the forced stop must wait for the process to exit"
        );
        assert_eq!(std::fs::read(&marker).unwrap(), b"stop");
    }
}
