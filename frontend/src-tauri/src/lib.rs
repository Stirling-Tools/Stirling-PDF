use tauri_plugin_shell::ShellExt;
use tauri::Manager;
use tauri::{RunEvent, WindowEvent};

// Store backend process handle and logs globally
use std::sync::Mutex;
use std::collections::VecDeque;

static BACKEND_PROCESS: Mutex<Option<tauri_plugin_shell::process::CommandChild>> = Mutex::new(None);
static BACKEND_LOGS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

// Helper function to add log entry
fn add_log(message: String) {
    let mut logs = BACKEND_LOGS.lock().unwrap();
    logs.push_back(format!("{}: {}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(), message));
    // Keep only last 100 log entries
    if logs.len() > 100 {
        logs.pop_front();
    }
    println!("{}", message); // Also print to console
}


// Command to start the backend with bundled JRE
#[tauri::command]
async fn start_backend(app: tauri::AppHandle) -> Result<String, String> {
    add_log("🚀 start_backend() called - Attempting to start backend with bundled JRE...".to_string());
    
    // Check if backend is already running
    {
        let process_guard = BACKEND_PROCESS.lock().unwrap();
        if process_guard.is_some() {
            add_log("⚠️ Backend already running, skipping start".to_string());
            return Ok("Backend already running".to_string());
        }
    }
    
    // Use Tauri's resource API to find the bundled JRE and JAR
    let resource_dir = app.path().resource_dir().map_err(|e| {
        let error_msg = format!("❌ Failed to get resource directory: {}", e);
        add_log(error_msg.clone());
        error_msg
    })?;
    
    add_log(format!("🔍 Resource directory: {:?}", resource_dir));
    
    // Find the bundled JRE
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
    
    // Find the Stirling-PDF JAR
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
            path.extension().and_then(|s| s.to_str()) == Some("jar") 
                && path.file_name().unwrap().to_string_lossy().contains("Stirling-PDF")
        })
        .collect();
    
    if jar_files.is_empty() {
        let error_msg = "No Stirling-PDF JAR found in libs directory.".to_string();
        add_log(error_msg.clone());
        return Err(error_msg);
    }
    
    // Sort by filename to get the latest version
    jar_files.sort_by(|a, b| {
        let name_a = a.file_name().to_string_lossy().to_string();
        let name_b = b.file_name().to_string_lossy().to_string();
        name_b.cmp(&name_a) // Reverse order to get latest first
    });
    
    let jar_path = jar_files[0].path();
    add_log(format!("📋 Selected JAR: {:?}", jar_path.file_name().unwrap()));
    
    // Normalize the paths to remove Windows UNC prefix \\?\
    let normalized_java_path = if cfg!(windows) {
        let path_str = java_executable.to_string_lossy();
        if path_str.starts_with(r"\\?\") {
            std::path::PathBuf::from(&path_str[4..]) // Remove \\?\ prefix
        } else {
            java_executable.clone()
        }
    } else {
        java_executable.clone()
    };
    
    let normalized_jar_path = if cfg!(windows) {
        let path_str = jar_path.to_string_lossy();
        if path_str.starts_with(r"\\?\") {
            std::path::PathBuf::from(&path_str[4..]) // Remove \\?\ prefix
        } else {
            jar_path.clone()
        }
    } else {
        jar_path.clone()
    };
    
    add_log(format!("📦 Found JAR file: {:?}", jar_path));
    add_log(format!("📦 Normalized JAR path: {:?}", normalized_jar_path));
    add_log(format!("📦 Normalized Java path: {:?}", normalized_java_path));
    
    // Log the equivalent command for external testing
    let java_command = format!(
        "\"{}\" -Xmx2g -DBROWSER_OPEN=false -DSTIRLING_PDF_DESKTOP_UI=false -jar \"{}\"",
        normalized_java_path.display(),
        normalized_jar_path.display()
    );
    add_log(format!("🔧 Equivalent command: {}", java_command));
    
    // Create Java command with bundled JRE using normalized paths
    // Configure logging to write outside src-tauri to prevent dev server restarts
    let temp_dir = std::env::temp_dir();
    let log_dir = temp_dir.join("stirling-pdf-logs");
    std::fs::create_dir_all(&log_dir).ok(); // Create log directory if it doesn't exist
    
    let sidecar_command = app
        .shell()
        .command(normalized_java_path.to_str().unwrap())
        .args([
            "-Xmx2g",
            "-DBROWSER_OPEN=false",
            "-DSTIRLING_PDF_DESKTOP_UI=false",
            "-DSTIRLING_PDF_TAURI_MODE=true",
            &format!("-Dlogging.file.path={}", log_dir.display()),
            "-Dlogging.file.name=stirling-pdf.log",
            "-jar",
            normalized_jar_path.to_str().unwrap()
        ])
        .env("TAURI_PARENT_PID", std::process::id().to_string());
    
    add_log("⚙️ Starting backend with bundled JRE...".to_string());
    
    let (mut rx, child) = sidecar_command
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
    
    // Listen to sidecar output for debugging
    tokio::spawn(async move {
        let mut _startup_detected = false;
        let mut error_count = 0;
        
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(output) => {
                    let output_str = String::from_utf8_lossy(&output);
                    add_log(format!("📤 Backend stdout: {}", output_str));
                    
                    // Look for startup indicators
                    if output_str.contains("Started SPDFApplication") || 
                       output_str.contains("Tomcat started") ||
                       output_str.contains("Started on port") ||
                       output_str.contains("Netty started") ||
                       output_str.contains("Started StirlingPDF") {
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
                    add_log(format!("📥 Backend stderr: {}", output_str));
                    
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
    
    // Wait for the backend to start
    println!("⏳ Waiting for backend startup...");
    tokio::time::sleep(std::time::Duration::from_millis(10000)).await;
    
    Ok("Backend startup initiated successfully with bundled JRE".to_string())
}

// Command to check if backend is healthy
#[tauri::command]
async fn check_backend_health() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    match client.get("http://localhost:8080/api/v1/info/status").send().await {
        Ok(response) => {
            let status = response.status();
            println!("💓 Health check response status: {}", status);
            if status.is_success() {
                match response.text().await {
                    Ok(body) => {
                        Ok(true)
                    }
                    Err(e) => {
                        println!("⚠️ Failed to read health response: {}", e);
                        Ok(false)
                    }
                }
            } else {
                println!("⚠️ Health check failed with status: {}", status);
                Ok(false)
            }
        }
        Err(e) => {
            println!("❌ Health check error: {}", e);
            Ok(false)
        }
    }
}



// Command to check bundled runtime and JAR
#[tauri::command]
async fn check_jar_exists(app: tauri::AppHandle) -> Result<String, String> {
    println!("🔍 Checking for bundled JRE and JAR files...");
    
    if let Ok(resource_dir) = app.path().resource_dir() {
        let mut status_parts = Vec::new();
        
        // Check bundled JRE
        let jre_dir = resource_dir.join("runtime").join("jre");
        let java_executable = if cfg!(windows) {
            jre_dir.join("bin").join("java.exe")
        } else {
            jre_dir.join("bin").join("java")
        };
        
        if java_executable.exists() {
            status_parts.push("✅ Bundled JRE found".to_string());
        } else {
            status_parts.push("❌ Bundled JRE not found".to_string());
        }
        
        // Check JAR files
        let libs_dir = resource_dir.join("libs");
        if libs_dir.exists() {
            match std::fs::read_dir(&libs_dir) {
                Ok(entries) => {
                    let jar_files: Vec<String> = entries
                        .filter_map(|entry| entry.ok())
                        .filter(|entry| {
                            let path = entry.path();
                            path.extension().and_then(|s| s.to_str()) == Some("jar") 
                               && path.file_name().unwrap().to_string_lossy().contains("Stirling-PDF")
                        })
                        .map(|entry| entry.file_name().to_string_lossy().to_string())
                        .collect();
                    
                    if !jar_files.is_empty() {
                        status_parts.push(format!("✅ Found JAR files: {:?}", jar_files));
                    } else {
                        status_parts.push("❌ No Stirling-PDF JAR files found".to_string());
                    }
                }
                Err(e) => {
                    status_parts.push(format!("❌ Failed to read libs directory: {}", e));
                }
            }
        } else {
            status_parts.push("❌ Libs directory not found".to_string());
        }
        
        Ok(status_parts.join("\n"))
    } else {
        Ok("❌ Could not access bundled resources".to_string())
    }
}




// Cleanup function to stop backend on app exit
fn cleanup_backend() {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
    
      // Automatically start the backend when Tauri starts
    //   let app_handle = app.handle().clone();
    //   tauri::async_runtime::spawn(
        // async move {
    //     match start_backend(app_handle).await {
    //       Ok(result) => {
    //         add_log(format!("🚀 Auto-started backend on Tauri startup: {}", result));
    //       }
    //       Err(error) => {
    //         add_log(format!("❌ Failed to auto-start backend: {}", error));
    //       }
    //     }
    //   });
      
      Ok(())
    }
    )
    .invoke_handler(tauri::generate_handler![start_backend, check_backend_health, check_jar_exists])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      match event {
        RunEvent::ExitRequested { .. } => {
          add_log("🔄 App exit requested, cleaning up...".to_string());
          cleanup_backend();
          // Use Tauri's built-in cleanup
          app_handle.cleanup_before_exit();
        }
        RunEvent::WindowEvent { event: WindowEvent::CloseRequested {.. }, .. } => {
          add_log("🔄 Window close requested, cleaning up...".to_string());
          cleanup_backend();
          // Allow the window to close
        }
        _ => {}
      }
    });
}
