use tauri::{RunEvent, WindowEvent, Emitter, Manager};

mod utils;
mod commands;

use commands::{
    start_backend,
    check_backend_health,
    get_opened_files,
    clear_opened_files,
    cleanup_backend,
    add_opened_file,
    is_default_pdf_handler,
    set_as_default_pdf_handler,
    get_backend_port,
};
use utils::{add_log, get_tauri_logs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
      // This callback runs when a second instance tries to start
      add_log(format!("📂 Second instance detected with args: {:?}", args));

      // Scan args for PDF files (skip first arg which is the executable)
      for arg in args.iter().skip(1) {
        if std::path::Path::new(arg).exists() {
          add_log(format!("📂 Forwarding file to existing instance: {}", arg));

          // Store file for later retrieval (in case frontend isn't ready yet)
          add_opened_file(arg.clone());

          // Bring the existing window to front
          if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
            let _ = window.unminimize();
          }
        }
      }

      // Emit a generic notification that files were added (frontend will re-read storage)
      let _ = app.emit("files-changed", ());
    }))
    .setup(|_app| {
      add_log("🚀 Tauri app setup started".to_string());

      // Process command line arguments on first launch
      let args: Vec<String> = std::env::args().collect();
      for arg in args.iter().skip(1) {
        if std::path::Path::new(arg).exists() {
          add_log(format!("📂 Initial file from command line: {}", arg));
          add_opened_file(arg.clone());
        }
      }

      add_log("🔍 DEBUG: Setup completed".to_string());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      start_backend,
      check_backend_health,
      get_backend_port,
      get_opened_files,
      clear_opened_files,
      get_tauri_logs,
      is_default_pdf_handler,
      set_as_default_pdf_handler,
    ])
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
          let mut added_files = false;
          for url in urls {
            let url_str = url.as_str();
            if url_str.starts_with("file://") {
              let file_path = url_str.strip_prefix("file://").unwrap_or(url_str);
              if file_path.ends_with(".pdf") {
                add_log(format!("📂 Processing opened PDF: {}", file_path));
                add_opened_file(file_path.to_string());
                added_files = true;
              }
            }
          }
          // Emit a generic notification that files were added (frontend will re-read storage)
          if added_files {
            let _ = app_handle.emit("files-changed", ());
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
