use tauri::Manager;
use crate::utils::add_log;

// Command to get opened file path (if app was launched with a file)
#[tauri::command]
pub async fn get_opened_file() -> Result<Option<String>, String> {
    // Get command line arguments
    let args: Vec<String> = std::env::args().collect();
    
    // Look for a PDF file argument (skip the first arg which is the executable)
    for arg in args.iter().skip(1) {
        if arg.ends_with(".pdf") && std::path::Path::new(arg).exists() {
            add_log(format!("📂 PDF file opened: {}", arg));
            return Ok(Some(arg.clone()));
        }
    }
    
    Ok(None)
}

// Command to check bundled runtime and JAR
#[tauri::command]
pub async fn check_jar_exists(app: tauri::AppHandle) -> Result<String, String> {
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
                            // Match any .jar file containing "stirling-pdf" (case-insensitive)
                            path.extension().and_then(|s| s.to_str()).map(|ext| ext.eq_ignore_ascii_case("jar")).unwrap_or(false)
                                && path.file_name()
                                    .and_then(|f| f.to_str())
                                    .map(|name| name.to_ascii_lowercase().contains("stirling-pdf"))
                                    .unwrap_or(false)
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