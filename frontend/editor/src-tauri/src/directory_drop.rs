/// Resolves dropped DOM files and folders on Windows without intercepting HTML drag-and-drop.
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("directory-drop")
        .on_webview_ready(|_webview| {
            #[cfg(target_os = "windows")]
            if let Err(error) = _webview.with_webview(|webview| {
                if let Err(error) = windows::attach(webview) {
                    log::warn!("Could not attach folder drop handler: {error}");
                }
            }) {
                log::warn!("Could not access folder drop webview: {error}");
            }
        })
        .build()
}

#[cfg(target_os = "windows")]
mod windows {
    use serde::Deserialize;
    use webview2_com::{
        take_pwstr, Microsoft::Web::WebView2::Win32::*, WebMessageReceivedEventHandler,
    };
    use webview2_core::{Interface, HSTRING, PWSTR};

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DropRequest {
        #[serde(rename = "type")]
        kind: String,
        request_id: String,
    }

    fn directory_path(args: &ICoreWebView2WebMessageReceivedEventArgs) -> Option<String> {
        // WebView2 owns the DOM object's path. Never accept a path supplied as JSON.
        unsafe {
            let objects = args
                .cast::<ICoreWebView2WebMessageReceivedEventArgs2>()
                .ok()?
                .AdditionalObjects()
                .ok()?;
            let mut count = 0;
            objects.Count(&mut count).ok()?;
            if count != 1 {
                return None;
            }
            let file = objects
                .GetValueAtIndex(0)
                .ok()?
                .cast::<ICoreWebView2File>()
                .ok()?;
            let mut path = PWSTR::null();
            file.Path(&mut path).ok()?;
            let path = take_pwstr(path);
            std::path::Path::new(&path).is_dir().then_some(path)
        }
    }

    fn file_paths(args: &ICoreWebView2WebMessageReceivedEventArgs) -> Vec<Option<String>> {
        unsafe {
            let Ok(args) = args.cast::<ICoreWebView2WebMessageReceivedEventArgs2>() else {
                return Vec::new();
            };
            let Ok(objects) = args.AdditionalObjects() else {
                return Vec::new();
            };
            let mut count = 0;
            if objects.Count(&mut count).is_err() {
                return Vec::new();
            }
            (0..count)
                .map(|index| {
                    let file = objects
                        .GetValueAtIndex(index)
                        .ok()?
                        .cast::<ICoreWebView2File>()
                        .ok()?;
                    let mut path = PWSTR::null();
                    file.Path(&mut path).ok()?;
                    let path = take_pwstr(path);
                    std::path::Path::new(&path).is_file().then_some(path)
                })
                .collect()
        }
    }

    pub(super) fn attach(webview: tauri::webview::PlatformWebview) -> webview2_core::Result<()> {
        // COM callbacks run on the WebView2 UI thread; the webview owns the registered handler.
        unsafe {
            let view = webview.controller().CoreWebView2()?;
            let mut token = 0;
            view.add_WebMessageReceived(
                &WebMessageReceivedEventHandler::create(Box::new(|sender, args| {
                    let (Some(sender), Some(args)) = (sender, args) else {
                        return Ok(());
                    };
                    let mut message = PWSTR::null();
                    if args.TryGetWebMessageAsString(&mut message).is_err() {
                        return Ok(());
                    }
                    let Ok(request) = serde_json::from_str::<DropRequest>(&take_pwstr(message))
                    else {
                        return Ok(());
                    };
                    if !matches!(
                        request.kind.as_str(),
                        "stirling-folder-drop" | "stirling-file-drop"
                    ) || request.request_id.len() > 64
                    {
                        return Ok(());
                    }
                    let mut source = PWSTR::null();
                    args.Source(&mut source)?;
                    let source = take_pwstr(source);
                    let allowed = tauri::Url::parse(&source)
                        .map(|url| {
                            matches!(url.scheme(), "tauri" | "http" | "https")
                                && crate::is_app_url(&url)
                        })
                        .unwrap_or(false);
                    if !allowed {
                        return Ok(());
                    }
                    let response = if request.kind == "stirling-file-drop" {
                        serde_json::json!({
                            "type": "stirling-file-drop-result",
                            "requestId": request.request_id,
                            "paths": file_paths(&args),
                        })
                    } else {
                        serde_json::json!({
                            "type": "stirling-folder-drop-result",
                            "requestId": request.request_id,
                            "path": directory_path(&args),
                        })
                    };
                    sender.PostWebMessageAsJson(&HSTRING::from(response.to_string()))?;
                    Ok(())
                })),
                &mut token,
            )
        }
    }
}
