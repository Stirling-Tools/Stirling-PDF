use tauri_plugin_shell::ShellExt;
use tauri::Manager;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use crate::utils::{add_log, app_data_dir};
use crate::state::connection_state::{AppConnectionState, ConnectionMode};

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

// Store backend process handle and port globally
static BACKEND_PROCESS: Mutex<Option<tauri_plugin_shell::process::CommandChild>> = Mutex::new(None);
static BACKEND_STARTING: Mutex<bool> = Mutex::new(false);
static BACKEND_PORT: Mutex<Option<u16>> = Mutex::new(None);
// Set by the event loop when the backend exits, so cleanup can wait for it.
static BACKEND_EXITED: AtomicBool = AtomicBool::new(true);
static BACKEND_SHUTDOWN_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

// Helper function to reset starting flag
fn reset_starting_flag() {
    let mut starting_guard = BACKEND_STARTING.lock().unwrap();
    *starting_guard = false;
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

// Check if backend is already running or starting
fn check_backend_status() -> Result<(), String> {
    // Check if backend is already running
    {
        let process_guard = BACKEND_PROCESS.lock().unwrap();
        if process_guard.is_some() {
            add_log("⚠️ Backend process already running, skipping start".to_string());
            return Err("Backend already running".to_string());
        }
    }

    // Check and set starting flag to prevent multiple simultaneous starts
    {
        let mut starting_guard = BACKEND_STARTING.lock().unwrap();
        if *starting_guard {
            add_log("⚠️ Backend already starting, skipping duplicate start".to_string());
            return Err("Backend startup already in progress".to_string());
        }
        *starting_guard = true;
    }

    Ok(())
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

/// Ordering key for `stirling-pdf-<version>.jar`: the numeric release components
/// and whether the version is a final release. Anything unparseable counts as
/// zero so comparison never panics, and the flag keeps `3.0.0-rc1` sorting below
/// `3.0.0`.
fn version_key(name: &str) -> (Vec<u64>, u8) {
    let lower = name.to_ascii_lowercase();
    let version = lower
        .strip_prefix("stirling-pdf-")
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
    *BACKEND_SHUTDOWN_FILE.lock().unwrap() = Some(shutdown_file.clone());

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
            let error_msg = format!("❌ Failed to spawn sidecar: {}", e);
            add_log(error_msg.clone());
            error_msg
        })?;

    BACKEND_EXITED.store(false, Ordering::Release);
    {
        let mut process_guard = BACKEND_PROCESS.lock().unwrap();
        *process_guard = Some(child);
    }

    add_log("✅ Backend started with bundled JRE, monitoring output...".to_string());

    // Start monitoring output
    monitor_backend_output(rx);

    Ok(())
}

// Monitor backend output in a separate task
fn monitor_backend_output(mut rx: tauri::async_runtime::Receiver<tauri_plugin_shell::process::CommandEvent>) {
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
                    BACKEND_EXITED.store(true, Ordering::Release);
                    let mut process_guard = BACKEND_PROCESS.lock().unwrap();
                    *process_guard = None;
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
        reset_starting_flag();
        error_msg
    })?;

    add_log(format!("🔍 Resource directory: {:?}", resource_dir));

    // Find the bundled JRE
    let java_executable = find_bundled_jre(&resource_dir).map_err(|e| {
        reset_starting_flag();
        e
    })?;

    // Find the Stirling-PDF JAR
    let jar_path = find_stirling_jar(&resource_dir).map_err(|e| {
        reset_starting_flag();
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
        reset_starting_flag();
        e
    })?;

    // Reset the starting flag since startup is complete
    reset_starting_flag();
    add_log("✅ Backend startup sequence completed, starting flag cleared".to_string());

    Ok("Backend startup initiated successfully with bundled JRE".to_string())
}

// Get the dynamically assigned backend port
#[tauri::command]
pub fn get_backend_port() -> Option<u16> {
    let port_guard = BACKEND_PORT.lock().unwrap();
    *port_guard
}

// Stop the backend on app exit: request a graceful Spring shutdown, then force.
pub fn cleanup_backend() {
    let child = BACKEND_PROCESS.lock().unwrap().take();
    let Some(child) = child else { return };
    let pid = child.pid();
    add_log(format!("App shutting down, stopping backend (PID: {})", pid));

    if let Some(path) = BACKEND_SHUTDOWN_FILE.lock().unwrap().clone() {
        if let Err(e) = std::fs::write(&path, b"stop") {
            add_log(format!("Could not write shutdown file: {}", e));
        }
    }

    let deadline = Instant::now() + Duration::from_secs(10);
    while !BACKEND_EXITED.load(Ordering::Acquire) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }

    if BACKEND_EXITED.load(Ordering::Acquire) {
        add_log(format!("Backend (PID: {}) stopped gracefully", pid));
    } else {
        add_log(format!("Backend (PID: {}) did not stop in time, killing", pid));
        let _ = child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::version_key;

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
        assert!(version_key("stirling-pdf-3.0.0-SNAPSHOT.jar") < version_key("stirling-pdf-3.0.0.jar"));
        assert!(version_key("stirling-pdf-3.0.0-rc1.jar") < version_key("stirling-pdf-3.0.0.jar"));

        let mut names = [
            "stirling-pdf-3.0.0-rc1.jar",
            "stirling-pdf-3.0.0.jar",
            "stirling-pdf-2.14.3.jar",
        ];
        names.sort_by_key(|name| std::cmp::Reverse(version_key(name)));
        assert_eq!(
            names,
            [
                "stirling-pdf-3.0.0.jar",
                "stirling-pdf-3.0.0-rc1.jar",
                "stirling-pdf-2.14.3.jar",
            ]
        );
    }

    #[test]
    fn version_key_tolerates_non_numeric_versions() {
        assert_eq!(version_key("not-a-version.jar"), (vec![0], 0));
        assert_eq!(version_key("stirling-pdf-3.0.0.jar").1, 1);
    }
}
