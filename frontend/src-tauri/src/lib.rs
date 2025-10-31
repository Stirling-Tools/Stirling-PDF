use tauri::{RunEvent, WindowEvent, Emitter};

mod utils;
mod commands;
mod file_handler;

use commands::{start_backend, check_backend_health, get_opened_file, clear_opened_file, cleanup_backend, set_opened_file};
use utils::{add_log, get_tauri_logs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Initialize file handler early for macOS
  file_handler::early_init();
  
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      add_log("🚀 Tauri app setup started".to_string());
      
      // Initialize platform-specific file handler
      file_handler::initialize_file_handler(&app.handle());
      
      add_log("🔍 DEBUG: Setup completed".to_string());
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
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
          add_log(format!("📂 Tauri file opened event: {:?}", urls));
          for url in urls {
            let url_str = url.as_str();
            if url_str.starts_with("file://") {
              let file_path = url_str.strip_prefix("file://").unwrap_or(url_str);
              if file_path.ends_with(".pdf") {
                add_log(format!("📂 Processing opened PDF: {}", file_path));
                set_opened_file(file_path.to_string());
                let _ = app_handle.emit("macos://open-file", file_path.to_string());
              }
            }
          }
        }
        _ => {
          // Only log unhandled events in debug mode to reduce noise
          // #[cfg(debug_assertions)]
          // add_log(format!("🔍 DEBUG: Unhandled event: {:?}", event));
        }
      }
    });
}