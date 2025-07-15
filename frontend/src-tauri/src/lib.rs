use tauri::{RunEvent, WindowEvent, Manager};

mod utils;
mod commands;

use commands::{start_backend, check_backend_health, get_opened_file, clear_opened_file, cleanup_backend, set_opened_file};
use utils::{add_log, get_tauri_logs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|_| {
      add_log("🚀 Tauri app setup started".to_string());
      
      // Log all command line arguments for debugging
      let args: Vec<String> = std::env::args().collect();
      add_log(format!("🔍 DEBUG: All command line args: {:?}", args));
      
      // Check command line arguments at startup for macOS file opening
      for (i, arg) in args.iter().enumerate() {
        add_log(format!("🔍 DEBUG: Arg {}: {}", i, arg));
        if i > 0 && arg.ends_with(".pdf") && std::path::Path::new(arg).exists() {
          add_log(format!("📂 File argument detected at startup: {}", arg));
          set_opened_file(arg.clone());
          break; // Only handle the first PDF file
        }
      }
      
      add_log("🔍 DEBUG: Setup completed, checking for opened file...".to_string());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![start_backend, check_backend_health, get_opened_file, clear_opened_file, get_tauri_logs])
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
        // Handle file open events (macOS specific)
        #[cfg(target_os = "macos")]
        RunEvent::OpenUrl { url } => {
          add_log(format!("🔍 DEBUG: OpenUrl event received: {}", url));
          // Handle URL-based file opening
          if url.starts_with("file://") {
            let file_path = url.strip_prefix("file://").unwrap_or(&url);
            if file_path.ends_with(".pdf") {
              add_log(format!("📂 File opened via URL event: {}", file_path));
              set_opened_file(file_path.to_string());
              
              // Emit event to frontend
              app_handle.emit_all("file-opened", file_path).unwrap();
            }
          }
        }
        _ => {
          add_log(format!("🔍 DEBUG: Unhandled event: {:?}", event));
        }
      }
    });
}