use tauri_plugin_shell::ShellExt;
use tauri::Manager;
use std::sync::Mutex;
use std::path::PathBuf;
use crate::utils::add_log;

// Store backend process handle globally
static BACKEND_PROCESS: Mutex<Option<tauri_plugin_shell::process::CommandChild>> = Mutex::new(None);
static BACKEND_STARTING: Mutex<bool> = Mutex::new(false);

// Helper function to reset starting flag
fn reset_starting_flag() {
    let mut starting_guard = BACKEND_STARTING.lock().unwrap();
    *starting_guard = false;
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
    
    // Sort by filename to get the latest version (case-insensitive)
    jar_files.sort_by(|a, b| {
        let name_a = a.file_name().to_string_lossy().to_ascii_lowercase();
        let name_b = b.file_name().to_string_lossy().to_ascii_lowercase();
        name_b.cmp(&name_a) // Reverse order to get latest first
    });
    
    let jar_path = jar_files[0].path();
    add_log(format!("📋 Selected JAR: {:?}", jar_path.file_name().unwrap()));
    Ok(jar_path)
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

// Create, configure and run the Java command to run Stirling-PDF JAR
fn run_stirling_pdf_jar(app: &tauri::AppHandle, java_path: &PathBuf, jar_path: &PathBuf) -> Result<(), String> {
    // Get platform-specific log directory
    let log_dir = if cfg!(target_os = "macos") {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join("Library").join("Logs").join("Stirling-PDF").join("backend")
    } else if cfg!(target_os = "windows") {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
        PathBuf::from(appdata).join("Stirling-PDF").join("backend-logs")
    } else {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join(".config").join("Stirling-PDF").join("backend-logs")
    };
    
    std::fs::create_dir_all(&log_dir).ok(); // Create log directory if it doesn't exist
    
    // Define all Java options in an array
    let log_path_option = format!("-Dlogging.file.path={}", log_dir.display());
    let java_options = vec![
        "-Xmx2g",
        "-DBROWSER_OPEN=false",
        "-DSTIRLING_PDF_DESKTOP_UI=false",
        "-DSTIRLING_PDF_TAURI_MODE=true",
        &log_path_option,
        "-Dlogging.file.name=stirling-pdf.log",
        "-jar",
        jar_path.to_str().unwrap()
    ];
    
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
    
    let sidecar_command = app
        .shell()
        .command(java_path.to_str().unwrap())
        .args(java_options)
        .env("TAURI_PARENT_PID", std::process::id().to_string());
    
    add_log("⚙️ Starting backend with bundled JRE...".to_string());
    
    let (rx, child) = sidecar_command
        .spawn()
        .map_err(|e| {
            let error_msg = format!("❌ Failed to spawn sidecar: {}", e);
            add_log(error_msg.clone());
            error_msg
        })?;
    
    // Store the process handle
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
                    add_log(format!("📤 Backend: {}", output_str));
                    
                    // Look for startup indicators
                    if output_str.contains("Started SPDFApplication") || 
                       output_str.contains("Navigate to "){
                        _startup_detected = true;
                        add_log(format!("🎉 Backend startup detected: {}", output_str));
                    }
                    
                    // Look for port binding
                    if output_str.contains("8080") {
                        add_log(format!("🔌 Port 8080 related output: {}", output_str));
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(output) => {
                    let output_str = String::from_utf8_lossy(&output);
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
                    // Clear the stored process handle
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
pub async fn start_backend(app: tauri::AppHandle) -> Result<String, String> {
    add_log("🚀 start_backend() called - Attempting to start backend with bundled JRE...".to_string());
    
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
    
    // Wait for the backend to start
    println!("⏳ Waiting for backend startup...");
    tokio::time::sleep(std::time::Duration::from_millis(10000)).await;
    
    // Reset the starting flag since startup is complete
    reset_starting_flag();
    add_log("✅ Backend startup sequence completed, starting flag cleared".to_string());
    
    Ok("Backend startup initiated successfully with bundled JRE".to_string())
}

// Cleanup function to stop backend on app exit
pub fn cleanup_backend() {
    let mut process_guard = BACKEND_PROCESS.lock().unwrap();
    if let Some(child) = process_guard.take() {
        let pid = child.pid();
        add_log(format!("🧹 App shutting down, cleaning up backend process (PID: {})", pid));
        
        match child.kill() {
            Ok(_) => {
                add_log(format!("✅ Backend process (PID: {}) terminated during cleanup", pid));
            }
            Err(e) => {
                add_log(format!("❌ Failed to terminate backend process during cleanup: {}", e));
                println!("❌ Failed to terminate backend process during cleanup: {}", e);
            }
        }
    }
}