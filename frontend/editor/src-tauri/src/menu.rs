use tauri::menu::Menu;
use tauri::{AppHandle, Manager, Runtime};

#[cfg(target_os = "macos")]
use tauri::menu::{
    AboutMetadata, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};

use crate::utils::add_log;

// Id of our custom Quit item. macOS routes Cmd+Q / the app-menu Quit through
// [NSApp terminate:], which fires RunEvent::Exit (not ExitRequested) and never
// asks windows to close - so the frontend's unsaved-changes guard is bypassed.
// We intercept the shortcut with this item and route it through each window's
// close flow instead.
pub const GRACEFUL_QUIT_MENU_ID: &str = "graceful-quit";

// macOS: mirror Tauri's default menu (Menu::default) but replace the standard
// Quit item with a custom one so Cmd+Q goes through request_graceful_quit().
#[cfg(target_os = "macos")]
pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg = app.package_info();
    let config = app.config();
    let about = AboutMetadata {
        name: Some(pkg.name.clone()),
        version: Some(pkg.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };

    let quit = MenuItem::with_id(
        app,
        GRACEFUL_QUIT_MENU_ID,
        format!("Quit {}", pkg.name),
        true,
        Some("CmdOrCtrl+Q"),
    )?;

    let app_menu = Submenu::with_items(
        app,
        pkg.name.clone(),
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[&PredefinedMenuItem::close_window(app, None)?],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[&PredefinedMenuItem::fullscreen(app, None)?],
    )?;

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(app, HELP_SUBMENU_ID, "Help", true, &[])?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

// Other platforms keep Tauri's default menu unchanged; the RunEvent::Exit
// cleanup path in lib.rs already guards against orphaned backends there.
#[cfg(not(target_os = "macos"))]
pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    Menu::default(app)
}

// Route a quit request through each window's close flow so the frontend's
// unsaved-changes guard (useExitWarning) runs. Closing the last window causes
// the runtime to emit RunEvent::ExitRequested, which kills the bundled backend.
// If somehow no windows exist, exit directly.
pub fn request_graceful_quit<R: Runtime>(app: &AppHandle<R>) {
    let windows = app.webview_windows();
    if windows.is_empty() {
        add_log("Quit requested with no open windows; exiting.".to_string());
        app.exit(0);
        return;
    }

    add_log(format!(
        "Quit requested; closing {} window(s) via close flow",
        windows.len()
    ));
    for (_, window) in windows {
        let _ = window.close();
    }
}
