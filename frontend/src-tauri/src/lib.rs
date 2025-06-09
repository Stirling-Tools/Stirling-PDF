use tauri_plugin_shell::ShellExt;
use tauri::Manager;

// Store backend process handle and logs globally
use std::sync::Mutex;
use std::sync::Arc;
use std::collections::VecDeque;

static BACKEND_PROCESS: Mutex<Option<Arc<tauri_plugin_shell::process::CommandChild>>> = Mutex::new(None);
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

// Command to get backend logs
#[tauri::command]
async fn get_backend_logs() -> Result<Vec<String>, String> {
    let logs = BACKEND_LOGS.lock().unwrap();
    Ok(logs.iter().cloned().collect())
}

// Command to start the backend sidecar
#[tauri::command]
async fn start_backend(app: tauri::AppHandle) -> Result<String, String> {
    add_log("🚀 Attempting to start backend sidecar...".to_string());
    
    // Check if backend is already running
    {
        let process_guard = BACKEND_PROCESS.lock().unwrap();
        if process_guard.is_some() {
            add_log("⚠️ Backend already running, skipping start".to_string());
            return Ok("Backend already running".to_string());
        }
    }
    
    add_log("📋 Creating Java command to run JAR directly".to_string());
    
    // Use Tauri's resource API to find the JAR file
    let resource_dir = app.path().resource_dir().map_err(|e| {
        let error_msg = format!("❌ Failed to get resource directory: {}", e);
        add_log(error_msg.clone());
        error_msg
    })?;
    
    add_log(format!("🔍 Looking for JAR in Tauri resource directory: {:?}", resource_dir));
    
    // In dev mode, resources are in target/debug/libs, in production they're bundled
    let libs_dir = resource_dir.join("libs");
    add_log(format!("🔍 Checking libs directory: {:?}", libs_dir));
    
    // Find all Stirling-PDF JAR files and pick the latest version
    let mut jar_files: Vec<_> = std::fs::read_dir(&libs_dir)
        .map_err(|e| {
            let error_msg = format!("Failed to read libs directory: {}. Make sure the JAR is copied to frontend/src-tauri/libs/", e);
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
        let error_msg = "No Stirling-PDF JAR found in Tauri resources/libs directory. Please run the build script to generate and copy the JAR.".to_string();
        add_log(error_msg.clone());
        return Err(error_msg);
    }
    
    // Sort by filename to get the latest version (assumes semantic versioning in filename)
    jar_files.sort_by(|a, b| {
        let name_a = a.file_name().to_string_lossy().to_string();
        let name_b = b.file_name().to_string_lossy().to_string();
        name_b.cmp(&name_a) // Reverse order to get latest first
    });
    
    let jar_path = jar_files[0].path();
    add_log(format!("📋 Selected latest JAR from {} available: {:?}", jar_files.len(), jar_path.file_name().unwrap()));
    
    // Normalize the path to remove Windows UNC prefix \\?\
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
    
    add_log(format!("📦 Found JAR file in resources: {:?}", jar_path));
    add_log(format!("📦 Normalized JAR path: {:?}", normalized_jar_path));
    
    // Log the equivalent command for external testing
    let java_command = format!(
        "java -Xmx2g  -DBROWSER_OPEN=false -DSTIRLING_PDF_DESKTOP_UI=true -jar \"{}\"",
        normalized_jar_path.display()
    );
    add_log(format!("🔧 Equivalent command to run externally: {}", java_command));
    
    // Create Java command directly
    let sidecar_command = app
        .shell()
        .command("java")
        .args([
            "-Xmx2g",
            "-DBROWSER_OPEN=false",
            "-jar",
            normalized_jar_path.to_str().unwrap()
        ]);
    
    add_log("⚙️ Sidecar command created, attempting to spawn...".to_string());
    
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
        *process_guard = Some(Arc::new(child));
    }
    
    add_log("✅ Sidecar spawned successfully, monitoring output...".to_string());
    
    // Listen to sidecar output for debugging
    tokio::spawn(async move {
        let mut startup_detected = false;
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
                        startup_detected = true;
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
    tokio::time::sleep(std::time::Duration::from_millis(5000)).await;
    
    Ok("Backend startup initiated successfully".to_string())
}

// Command to check if backend is healthy
#[tauri::command]
async fn check_backend_health() -> Result<bool, String> {
    println!("🔍 Checking backend health...");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    match client.get("http://localhost:8080/actuator/health").send().await {
        Ok(response) => {
            let status = response.status();
            println!("💓 Health check response status: {}", status);
            if status.is_success() {
                match response.text().await {
                    Ok(body) => {
                        println!("💓 Health check response: {}", body);
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

// Command to get backend process status
#[tauri::command]
async fn get_backend_status() -> Result<String, String> {
    let process_guard = BACKEND_PROCESS.lock().unwrap();
    match process_guard.as_ref() {
        Some(child) => {
            // Try to check if process is still alive
            let pid = child.pid();
            println!("🔍 Checking backend process status, PID: {}", pid);
            Ok(format!("Backend process is running (PID: {})", pid))
        },
        None => Ok("Backend process is not running".to_string()),
    }
}

// Command to check if backend port is accessible
#[tauri::command]
async fn check_backend_port() -> Result<bool, String> {
    println!("🔍 Checking if port 8080 is accessible...");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    match client.head("http://localhost:8080/").send().await {
        Ok(response) => {
            println!("✅ Port 8080 responded with status: {}", response.status());
            Ok(true)
        }
        Err(e) => {
            println!("❌ Port 8080 not accessible: {}", e);
            Ok(false)
        }
    }
}

// Command to check if JAR file exists
#[tauri::command]
async fn check_jar_exists(app: tauri::AppHandle) -> Result<String, String> {
    println!("🔍 Checking for JAR files in Tauri resources...");
    
    // Check in the Tauri resource directory (bundled)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let jar_path = resource_dir;
        println!("Checking bundled resources: {:?}", jar_path);
        
        if jar_path.exists() {
            match std::fs::read_dir(&jar_path) {
                Ok(entries) => {
                    let mut jar_files = Vec::new();
                    for entry in entries {
                        if let Ok(entry) = entry {
                            let path = entry.path();
                            if path.extension().and_then(|s| s.to_str()) == Some("jar") 
                               && path.file_name()
                                      .unwrap()
                                      .to_string_lossy()
                                      .contains("Stirling-PDF") {
                                jar_files.push(path.file_name().unwrap().to_string_lossy().to_string());
                            }
                        }
                    }
                    if !jar_files.is_empty() {
                        println!("✅ Found JAR files in bundled resources: {:?}", jar_files);
                        return Ok(format!("Found JAR files: {:?}", jar_files));
                    }
                }
                Err(e) => {
                    println!("❌ Failed to read resource directory: {}", e);
                }
            }
        }
    }
    
    // Check in development mode location (libs directory)
    let dev_jar_path = std::path::PathBuf::from("libs");
    println!("Checking development libs directory: {:?}", dev_jar_path);
    
    if dev_jar_path.exists() {
        match std::fs::read_dir(&dev_jar_path) {
            Ok(entries) => {
                let mut jar_files = Vec::new();
                for entry in entries {
                    if let Ok(entry) = entry {
                        let path = entry.path();
                        if path.extension().and_then(|s| s.to_str()) == Some("jar") 
                           && path.file_name()
                                  .unwrap()
                                  .to_string_lossy()
                                  .contains("Stirling-PDF") {
                            jar_files.push(path.file_name().unwrap().to_string_lossy().to_string());
                        }
                    }
                }
                if !jar_files.is_empty() {
                    println!("✅ Found JAR files in development libs: {:?}", jar_files);
                    return Ok(format!("Found JAR files: {:?}", jar_files));
                }
            }
            Err(e) => {
                println!("❌ Failed to read libs directory: {}", e);
            }
        }
    }
    
    println!("❌ No Stirling-PDF JAR files found");
    Ok("No Stirling-PDF JAR files found. Please run './build-tauri.sh' or 'build-tauri.bat' to build and copy the JAR.".to_string())
}

// Command to test sidecar binary directly
#[tauri::command]
async fn test_sidecar_binary(app: tauri::AppHandle) -> Result<String, String> {
    println!("🔍 Testing sidecar binary availability...");
    
    // Test if we can create the sidecar command (this validates the binary exists)
    match app.shell().sidecar("stirling-pdf-backend") {
        Ok(_) => {
            println!("✅ Sidecar binary 'stirling-pdf-backend' is available");
            Ok("Sidecar binary 'stirling-pdf-backend' is available and can be executed".to_string())
        }
        Err(e) => {
            println!("❌ Failed to access sidecar binary: {}", e);
            Ok(format!("Sidecar binary not available: {}. Make sure the binary exists in the binaries/ directory with correct permissions.", e))
        }
    }
}

// Command to check Java environment
#[tauri::command]
async fn check_java_environment() -> Result<String, String> {
    println!("🔍 Checking Java environment...");
    
    let output = std::process::Command::new("java")
        .arg("--version")
        .output();
    
    match output {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let version_info = if !stdout.is_empty() { stdout } else { stderr };
                println!("✅ Java found: {}", version_info);
                Ok(format!("Java available: {}", version_info.trim()))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("❌ Java command failed: {}", stderr);
                Ok(format!("Java command failed: {}", stderr))
            }
        }
        Err(e) => {
            println!("❌ Java not found: {}", e);
            Ok(format!("Java not found or not in PATH: {}", e))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      // Automatically start the backend when Tauri starts
      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await; // Small delay to ensure app is ready
        match start_backend(app_handle).await {
          Ok(result) => {
            add_log(format!("🚀 Auto-started backend on Tauri startup: {}", result));
          }
          Err(error) => {
            add_log(format!("❌ Failed to auto-start backend: {}", error));
          }
        }
      });
      
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![start_backend, check_backend_health, check_jar_exists, test_sidecar_binary, get_backend_status, check_backend_port, check_java_environment, get_backend_logs])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
