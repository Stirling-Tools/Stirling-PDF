use tauri::{Manager, RunEvent, WindowEvent, Emitter};

mod utils;
mod commands;
mod state;

use commands::{
    add_opened_file,
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

#[cfg(target_os = "linux")]
fn configure_linux_webview() {
  let mut applied_settings = Vec::new();

  if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    applied_settings.push("WEBKIT_DISABLE_COMPOSITING_MODE=1 (software rendering)");
  }

  if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    applied_settings.push("WEBKIT_DISABLE_DMABUF_RENDERER=1 (fallback EGL renderer)");
  }

  if !applied_settings.is_empty() {
    add_log(format!(
      "🛠️ Applied Linux WebKit fallbacks to avoid EGL issues: {}",
      applied_settings.join(", ")
    ));
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(target_os = "linux")]
  configure_linux_webview();

  tauri::Builder::default()
    .plugin(
      tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
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
    .setup(|app| {
      add_log("🚀 Tauri app setup started".to_string());

      // Process command line arguments on first launch
      let args: Vec<String> = std::env::args().collect();
      for arg in args.iter().skip(1) {
        if std::path::Path::new(arg).exists() {
          add_log(format!("📂 Initial file from command line: {}", arg));
          add_opened_file(arg.clone());
        }
      }

      // Start backend immediately, non-blocking
      let app_handle = app.handle().clone();

      tauri::async_runtime::spawn(async move {
        add_log("🚀 Starting bundled backend in background".to_string());
        let connection_state = app_handle.state::<AppConnectionState>();
        if let Err(e) = commands::backend::start_backend(app_handle.clone(), connection_state).await {
          add_log(format!("⚠️ Backend start failed: {}", e));
        }
      });

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
        RunEvent::WindowEvent { event: WindowEvent::DragDrop(drag_drop_event), .. } => {
          use tauri::DragDropEvent;
          match drag_drop_event {
            DragDropEvent::Drop { paths, .. } => {
              add_log(format!("📂 Files dropped: {:?}", paths));
              let mut added_files = false;

              for path in paths {
                if let Some(path_str) = path.to_str() {
                  add_log(format!("📂 Processing dropped file: {}", path_str));
                  add_opened_file(path_str.to_string());
                  added_files = true;
                }
              }

              if added_files {
                let _ = app_handle.emit("files-changed", ());
              }
            }
            _ => {}
          }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
          add_log(format!("📂 Tauri file opened event: {:?}", urls));
          let mut added_files = false;

          for url in urls {
            let url_str = url.as_str();
            if url_str.starts_with("file://") {
              let file_path = url_str.strip_prefix("file://").unwrap_or(url_str);
              add_log(format!("📂 Processing opened file: {}", file_path));
              add_opened_file(file_path.to_string());
              added_files = true;
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
