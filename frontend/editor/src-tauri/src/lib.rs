use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

mod utils;
pub mod commands;
mod state;

use commands::{
    add_opened_file,
    cleanup_backend,
    clear_auth_token,
    clear_opened_files,
    clear_refresh_token,
    clear_user_info,
    forward_files_to_window,
    is_default_pdf_handler,
    get_auth_token,
    get_backend_port,
    get_connection_config,
    get_opened_files,
    open_files_in_new_window,
    open_in_new_window,
    pop_opened_files,
    pop_window_file_ids,
    get_refresh_token,
    get_user_info,
    is_first_launch,
    login,
    proxy_local_pdf_request,
    reset_setup_completion,
    save_auth_token,
    save_refresh_token,
    save_user_info,
    set_connection_mode,
    set_as_default_pdf_handler,
    get_desktop_os,
    get_update_mode,
    print_pdf_file_native,
    set_update_mode,
    start_backend,
    start_oauth_login,
    can_install_updates,
    check_for_update,
    download_and_install_update,
    get_app_version,
    restart_app,
    target_window_label,
    MAIN_WINDOW_LABEL,
};
use commands::connection::apply_provisioning_if_present;
use state::connection_state::AppConnectionState;
use utils::{add_log, get_tauri_logs};
use tauri_plugin_deep_link::DeepLinkExt;

fn dispatch_deep_link(app: &AppHandle, url: &str) {
  add_log(format!("🔗 Dispatching deep link: {}", url));
  let _ = app.emit("deep-link", url.to_string());

  if let Some(window) = app.get_webview_window("main") {
    let _ = window.set_focus();
    let _ = window.unminimize();
  }
}

// Extract existing file paths from CLI args (skips the executable name).
fn parse_launch_files(args: &[String]) -> Vec<String> {
  args
    .iter()
    .skip(1)
    .filter(|arg| std::path::Path::new(arg).exists())
    .cloned()
    .collect()
}

use std::sync::Arc;
use tokio::sync::RwLock;
use lru::LruCache;
use std::num::NonZeroUsize;

fn status_response(status: u16) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .body(Vec::new())
        .unwrap()
}

fn full_response(mime: &str, bytes: &[u8]) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", mime)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("Accept-Ranges", "bytes")
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes.to_vec())
        .unwrap()
}

fn mime_for(path: &std::path::Path) -> &'static str {
  match path.extension().and_then(|ext| ext.to_str()) {
      Some("html")        => "text/html; charset=utf-8",
      Some("css")         => "text/css; charset=utf-8",
      Some("js")          => "application/javascript; charset=utf-8",
      Some("wasm")        => "application/wasm",
      Some("pdf")         => "application/pdf",
      Some("png")         => "image/png",
      Some("jpg")
      | Some("jpeg")      => "image/jpeg",
      Some("gif")         => "image/gif",
      Some("webp")        => "image/webp",
      Some("svg")         => "image/svg+xml",
      Some("json")        => "application/json",
      Some("woff")        => "font/woff",
      Some("woff2")       => "font/woff2",
      Some("ttf")         => "font/ttf",
      Some("ico")         => "image/x-icon",
      _                   => "application/octet-stream",
  }
}

fn parse_range(header: &str, file_len: u64) -> Option<(u64, u64)> {
    let s = header.strip_prefix("bytes=")?;
    let mut parts = s.splitn(2, '-');
    let start: u64 = parts.next()?.parse().ok()?;
    let end: u64 = parts.next()
        .and_then(|e| if e.is_empty() { None } else { e.parse().ok() })
        .unwrap_or(file_len.saturating_sub(1));
    if start > end || end >= file_len { return None; }
    Some((start, end))
}

fn decode_and_canonicalize(uri: &tauri::http::Uri, app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
  let path_str = urlencoding::decode(uri.path()).unwrap_or(std::borrow::Cow::Borrowed(uri.path())).into_owned();

  #[cfg(target_os = "windows")]
  let path_str = if path_str.starts_with('/') && path_str.chars().nth(2) == Some(':') {
      path_str[1..].to_string()
  } else {
      path_str
  };

  let raw_path = std::path::Path::new(&path_str);

  // Canonicalize the requested path to prevent path traversal (e.g. /../)
  let canonical_path = std::fs::canonicalize(raw_path).ok()?;

  // Resolve allowed roots dynamically
  let resource_dir = app_handle.path().resource_dir().ok().and_then(|p| std::fs::canonicalize(p).ok());
  let app_data_dir = app_handle.path().app_local_data_dir().ok().and_then(|p| std::fs::canonicalize(p).ok());
  let temp_dir = std::fs::canonicalize(std::env::temp_dir()).ok();

  let mut is_allowed = false;
  if let Some(ref r) = resource_dir {
      if canonical_path.starts_with(r) { is_allowed = true; }
  }
  if let Some(ref a) = app_data_dir {
      if canonical_path.starts_with(a) { is_allowed = true; }
  }
  if let Some(ref t) = temp_dir {
      if canonical_path.starts_with(t) { is_allowed = true; }
  }

  if is_allowed {
      Some(canonical_path)
  } else {
      None
  }
}

fn validated_compressed(
    compressed: &std::path::PathBuf,
    resource_dir: &Option<std::path::PathBuf>,
    app_data_dir: &Option<std::path::PathBuf>,
    temp_dir: &Option<std::path::PathBuf>,
) -> Option<std::path::PathBuf> {
    let p = std::fs::canonicalize(compressed).ok()?;
    if !p.is_file() { return None; }

    let mut allowed = false;
    if let Some(ref r) = resource_dir {
        if p.starts_with(r) { allowed = true; }
    }
    if let Some(ref a) = app_data_dir {
        if p.starts_with(a) { allowed = true; }
    }
    if let Some(ref t) = temp_dir {
        if p.starts_with(t) { allowed = true; }
    }

    if allowed {
        Some(p)
    } else {
        None
    }
}

async fn serve_range(path: &std::path::Path, range_header: &str, mime: &str) -> tauri::http::Response<Vec<u8>> {
    let file_len = match tokio::fs::metadata(path).await {
        Ok(m) => m.len(),
        Err(_) => return status_response(404),
    };

    if let Some((start, end)) = parse_range(range_header, file_len) {
        use tokio::io::{AsyncReadExt, AsyncSeekExt};
        if let Ok(mut file) = tokio::fs::File::open(path).await {
            if file.seek(std::io::SeekFrom::Start(start)).await.is_ok() {
                let chunk_size = (end - start + 1) as usize;
                let mut buf = vec![0u8; chunk_size];
                if file.read_exact(&mut buf).await.is_ok() {
                    return tauri::http::Response::builder()
                        .status(206) // Partial Content
                        .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_len))
                        .header("Accept-Ranges", "bytes")
                        .header("Content-Length", chunk_size.to_string())
                        .header("Content-Type", mime)
                        .header("Cache-Control", "public, max-age=31536000, immutable")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(buf)
                        .unwrap();
                }
            }
        }
    }

    // Fallback: serve full file using tokio::fs
    match tokio::fs::read(path).await {
        Ok(bytes) => full_response(mime, &bytes),
        Err(_) => status_response(500),
    }
}

async fn try_compressed(
  path: &std::path::Path,
  mime: &str,
  resource_dir: &Option<std::path::PathBuf>,
  app_data_dir: &Option<std::path::PathBuf>,
  temp_dir: &Option<std::path::PathBuf>,
) -> Option<tauri::http::Response<Vec<u8>>> {
  let mut br_path = path.to_path_buf();
  if let Some(ext) = path.extension() {
      let mut new_ext = ext.to_os_string();
      new_ext.push(".br");
      br_path.set_extension(new_ext);
  } else {
      br_path.set_extension("br");
  }

  let mut gz_path = path.to_path_buf();
  if let Some(ext) = path.extension() {
      let mut new_ext = ext.to_os_string();
      new_ext.push(".gz");
      gz_path.set_extension(new_ext);
  } else {
      gz_path.set_extension("gz");
  }

  if let Some(br) = validated_compressed(&br_path, resource_dir, app_data_dir, temp_dir) {
    if let Ok(bytes) = std::fs::read(&br) {
      return Some(tauri::http::Response::builder()
        .header("Content-Type", mime)
        .header("Content-Encoding", "br")
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("Access-Control-Allow-Origin", "*")
        .status(200)
        .body(bytes)
        .unwrap());
    }
  }

  if let Some(gz) = validated_compressed(&gz_path, resource_dir, app_data_dir, temp_dir) {
    if let Ok(bytes) = std::fs::read(&gz) {
      return Some(tauri::http::Response::builder()
        .header("Content-Type", mime)
        .header("Content-Encoding", "gzip")
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("Access-Control-Allow-Origin", "*")
        .status(200)
        .body(bytes)
        .unwrap());
    }
  }

  None
}

// URLs the webview is allowed to show: the bundled app and dev server only.
// Anything else (file://, https://...) must never replace the app UI.
fn is_app_url(url: &tauri::Url) -> bool {
  match url.scheme() {
    "tauri" | "about" | "blob" | "data" => true,
    "http" | "https" => matches!(
      url.host_str(),
      Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")
    ),
    _ => false,
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // WebKitGTK's DMA-BUF renderer crashes the web process on NVIDIA and some
  // Wayland stacks (blank window, app dying on tool switch). Opt out unless overridden.
  #[cfg(target_os = "linux")]
  if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
  }
  let cache: Arc<RwLock<LruCache<String, Arc<Vec<u8>>>>> = Arc::new(RwLock::new(
    LruCache::new(NonZeroUsize::new(128).unwrap())
  ));

  tauri::Builder::default()
    .register_asynchronous_uri_scheme_protocol("asset", move |ctx, request, responder| {
      let app_handle = ctx.app_handle().clone();

      // Decode and canonicalize path synchronously (cheap)
      let Some(canonical_path) = decode_and_canonicalize(request.uri(), &app_handle) else {
          responder.respond(status_response(404));
          return;
      };

      // Extract Range header
      let range = request.headers()
          .get("range")
          .and_then(|v| v.to_str().ok())
          .map(|s| s.to_string());

      let cache = Arc::clone(&cache);

      // Spawn on Tokio thread pool
      tauri::async_runtime::spawn(async move {
          let mime = mime_for(&canonical_path);
          let ext = canonical_path.extension().and_then(|e| e.to_str()).unwrap_or("");
          let is_cacheable = matches!(
              ext,
              "js" | "css" | "wasm" | "html" | "woff2"
          );

          // Range requests bypass cache and compression
          if let Some(ref r) = range {
              let response = serve_range(&canonical_path, r, mime).await;
              responder.respond(response);
              return;
          }

          // Check for pre-compressed static assets (no range requests)
          if is_cacheable {
              let resource_dir = app_handle.path().resource_dir().ok().and_then(|p| std::fs::canonicalize(p).ok());
              let app_data_dir = app_handle.path().app_local_data_dir().ok().and_then(|p| std::fs::canonicalize(p).ok());
              let temp_dir = std::fs::canonicalize(std::env::temp_dir()).ok();

              if let Some(resp) = try_compressed(&canonical_path, mime, &resource_dir, &app_data_dir, &temp_dir).await {
                  responder.respond(resp);
                  return;
              }
          }

          // LRU cache for hot static assets
          if is_cacheable {
              let key = canonical_path.to_string_lossy().to_string();
              let cached = cache.read().await.peek(&key).cloned();
              if let Some(bytes) = cached {
                  responder.respond(full_response(mime, &bytes));
                  return;
              }
              if let Ok(bytes) = tokio::fs::read(&canonical_path).await {
                  let bytes = Arc::new(bytes);
                  cache.write().await.put(key, Arc::clone(&bytes));
                  responder.respond(full_response(mime, &bytes));
                  return;
              }
          }

          // Fallback for large files / user files / uncached data (like PDFs)
          match tokio::fs::read(&canonical_path).await {
              Ok(bytes) => {
                  responder.respond(full_response(mime, &bytes));
              }
              Err(_) => {
                  responder.respond(status_response(500));
              }
          }
      });
    })
    .plugin(
      // Dropping a file outside a dropzone makes WebKit navigate the webview to
      // that file, killing the app UI and its close handler (window becomes
      // unclosable). Block every off-app navigation at the Rust layer.
      tauri::plugin::Builder::<tauri::Wry, ()>::new("navigation-guard")
        .on_navigation(|_webview, url| {
          let allowed = is_app_url(url);
          if !allowed {
            add_log(format!("🚫 Blocked webview navigation to: {}", url));
          }
          allowed
        })
        .build()
    )
    .plugin(
      tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .build()
    )
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .manage(AppConnectionState::default())
    .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
      // Runs in the existing instance when a second launch is attempted
      // (e.g. "open with" / double-click while the app is running).
      add_log(format!("📂 Second instance detected with args: {:?}", args));

      let files = parse_launch_files(&args);
      // Route to the window the user is in (focused -> main -> any) so opens
      // consolidate into one window instead of spawning a new one.
      let label = target_window_label(app).unwrap_or_else(|| MAIN_WINDOW_LABEL.to_string());

      if !files.is_empty() {
        add_log(format!("📂 Forwarding {} file(s) to existing window '{}'", files.len(), label));
        forward_files_to_window(app, &label, files);
      } else if let Some(window) = app.get_webview_window(&label) {
        // No files: just bring the app to the front.
        let _ = window.set_focus();
        let _ = window.unminimize();
      }
    }))
    .setup(|app| {
      add_log("🚀 Tauri app setup started".to_string());

      // Windows: drop the native title bar so the in-app custom title bar
      // (window controls + drag region) takes over. Runtime toggle because the
      // main window is defined in tauri.conf.json; spawned windows set it at
      // build time in window.rs. macOS/Linux keep their native decorations.
      #[cfg(target_os = "windows")]
      {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
          let _ = window.set_decorations(false);
        }
      }

      // Files passed on the command line at first launch load into the main
      // window once the frontend mounts.
      let args: Vec<String> = std::env::args().collect();
      for path in parse_launch_files(&args) {
        add_log(format!("📂 Initial file from command line: {}", path));
        add_opened_file(path);
      }

      {
        let app_handle = app.handle();
        // On macOS the plugin registers schemes via bundle metadata, so runtime registration is required only on Windows/Linux
        #[cfg(any(target_os = "linux", target_os = "windows"))]
        if let Err(err) = app_handle.deep_link().register_all() {
          add_log(format!("⚠️ Failed to register deep link handler: {}", err));
        }

        if let Ok(Some(urls)) = app_handle.deep_link().get_current() {
          let initial_handle = app_handle.clone();
          for url in urls {
            dispatch_deep_link(&initial_handle, url.as_str());
          }
        }

        let event_app_handle = app_handle.clone();
        app_handle.deep_link().on_open_url(move |event| {
          for url in event.urls() {
            dispatch_deep_link(&event_app_handle, url.as_str());
          }
        });
      }

      if let Err(err) = apply_provisioning_if_present(&app.handle()) {
        add_log(format!("⚠️ Failed to apply provisioning file: {}", err));
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
      pop_opened_files,
      clear_opened_files,
      open_in_new_window,
      open_files_in_new_window,
      pop_window_file_ids,
      get_tauri_logs,
      get_connection_config,
      set_connection_mode,
      is_default_pdf_handler,
      set_as_default_pdf_handler,
      is_first_launch,
      reset_setup_completion,
      login,
      proxy_local_pdf_request,
      save_auth_token,
      get_auth_token,
      clear_auth_token,
      save_refresh_token,
      get_refresh_token,
      clear_refresh_token,
      save_user_info,
      get_user_info,
      clear_user_info,
      start_oauth_login,
      get_desktop_os,
      print_pdf_file_native,
      can_install_updates,
      check_for_update,
      download_and_install_update,
      get_app_version,
      get_update_mode,
      set_update_mode,
      restart_app,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      match event {
        RunEvent::ExitRequested { .. } => {
          add_log("🔄 App exit requested, cleaning up...".to_string());
          cleanup_backend();
        }
        RunEvent::WindowEvent { event: WindowEvent::CloseRequested {.. }, label, .. } => {
          add_log("🔄 Window close requested (will cleanup on actual exit)...".to_string());
          // Don't cleanup here - let JavaScript handler prevent close if needed
          // Backend cleanup happens in ExitRequested when window actually closes
          //
          // Failsafe: if the webview somehow left the app (JS close handler gone,
          // window would stay open forever), destroy the window directly.
          if let Some(window) = app_handle.get_webview_window(&label) {
            let off_app = window.url().map(|u| !is_app_url(&u)).unwrap_or(false);
            if off_app {
              add_log(format!("🚨 Webview '{}' is off-app, destroying window directly", label));
              let _ = window.destroy();
            }
          }
        }
        RunEvent::WindowEvent { event: WindowEvent::DragDrop(drag_drop_event), label, .. } => {
          use tauri::DragDropEvent;
          if let DragDropEvent::Drop { paths, .. } = drag_drop_event {
            add_log(format!("📂 Files dropped on window '{}': {:?}", label, paths));
            let file_paths: Vec<String> = paths
              .iter()
              .filter_map(|p| p.to_str().map(|s| s.to_string()))
              .collect();

            // Route to the window the file was actually dropped on.
            if !file_paths.is_empty() {
              forward_files_to_window(app_handle, &label, file_paths);
            }
          }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
          add_log(format!("📂 Tauri file opened event: {:?}", urls));
          let file_paths: Vec<String> = urls
            .iter()
            .filter_map(|url| {
              if url.scheme() == "file" {
                url.to_file_path().ok()
                  .and_then(|p| p.to_str().map(|s| s.to_string()))
              } else {
                None
              }
            })
            .collect();

          if !file_paths.is_empty() {
            // Route to the window the user is in (focused -> main -> any).
            let label = target_window_label(app_handle).unwrap_or_else(|| MAIN_WINDOW_LABEL.to_string());
            forward_files_to_window(app_handle, &label, file_paths);
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

#[cfg(test)]
mod tests {
  use super::is_app_url;

  fn allows(raw: &str) -> bool {
    is_app_url(&tauri::Url::parse(raw).expect("valid url"))
  }

  #[test]
  fn allows_bundled_app_and_dev_server() {
    assert!(allows("tauri://localhost/index.html"));
    assert!(allows("http://tauri.localhost/"));
    assert!(allows("http://localhost:5173/"));
    assert!(allows("http://127.0.0.1:8080/api"));
    assert!(allows("about:blank"));
    assert!(allows("blob:http://localhost:5173/abc"));
    assert!(allows("data:text/html,hi"));
  }

  #[test]
  fn blocks_dropped_files() {
    // The #6872 lockup: webview navigating to a dropped PDF.
    assert!(!allows("file:///C:/Users/me/report.pdf"));
    assert!(!allows("file:///home/me/report.pdf"));
  }

  #[test]
  fn blocks_remote_origins() {
    assert!(!allows("https://example.com/"));
    assert!(!allows("http://evil.test/"));
    // Look-alike hosts must not slip past the allowlist.
    assert!(!allows("https://localhost.evil.test/"));
    assert!(!allows("https://nottauri.localhost.evil.test/"));
  }
}
