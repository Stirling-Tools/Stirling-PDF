use tauri::{RunEvent, WindowEvent};

mod utils;
mod commands;

use commands::{start_backend, check_backend_health, get_opened_file, clear_opened_file, cleanup_backend, set_opened_file};
use utils::add_log;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|_app| {Ok(())})
    .invoke_handler(tauri::generate_handler![start_backend, check_backend_health, get_opened_file, clear_opened_file])
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
        // Handle macOS file open events
        RunEvent::Opened { urls } => {
          for url in urls {
            add_log(format!("📂 File opened via macOS event: {}", url));
            
            // Convert URL to file path if it's a file URL
            if let Ok(path) = url.to_file_path() {
              if let Some(path_str) = path.to_str() {
                if path_str.ends_with(".pdf") {
                  set_opened_file(path_str.to_string());
                }
              }
            }
          }
        }
        _ => {}
      }
    });
}