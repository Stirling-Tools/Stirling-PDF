use tauri::{Manager, RunEvent, WindowEvent, Emitter};

mod utils;
mod commands;
mod state;

use commands::{
    add_opened_file,
    check_backend_health,
    cleanup_backend,
    clear_auth_token,
    clear_opened_files,
    clear_user_info,
    is_default_pdf_handler,
    get_auth_token,
    get_backend_port,
    get_connection_config,
    get_opened_files,
    get_user_info,
    is_first_launch,
    login,
    reset_setup_completion,
    save_auth_token,
    save_user_info,
    set_connection_mode,
    set_as_default_pdf_handler,
    start_backend,
    start_oauth_login,
};
use state::connection_state::AppConnectionState;
use utils::{add_log, get_tauri_logs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Debug)
        .build()
    )
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .manage(AppConnectionState::default())
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
      get_backend_port,
      get_opened_files,
      clear_opened_files,
      get_tauri_logs,
      get_connection_config,
      set_connection_mode,
      is_default_pdf_handler,
      set_as_default_pdf_handler,
      is_first_launch,
      reset_setup_completion,
      check_backend_health,
      login,
      save_auth_token,
      get_auth_token,
      clear_auth_token,
      save_user_info,
      get_user_info,
      clear_user_info,
      start_oauth_login,
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
        RunEvent::Opened { urls } => {
          add_log(format!("📂 Tauri opened event: {:?}", urls));
          let mut added_files = false;

          for url in urls {
            let url_str = url.as_str();

            // Handle file:// URLs (PDF file opens)
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
