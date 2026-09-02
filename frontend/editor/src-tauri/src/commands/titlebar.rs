// Paint the native Windows title bar (caption) to match the app theme.
//
// Left to itself the caption follows the OS "show accent colour on title bars"
// setting, so it renders as a stray coloured strip disconnected from the dark
// (or light) Stirling UI below it. Windows 11 lets an app override the caption
// background and text via DwmSetWindowAttribute; we drive those from the app's
// --c-bg / --c-text so the chrome reads as part of the window.
//
// Windows 11 build 22000+ only: on older builds the attributes are silently
// ignored (no error), and on macOS/Linux this whole module is a no-op.

/// An sRGB colour supplied by the frontend (resolved from a CSS custom property).
// Fields are only read on Windows, where they feed the COLORREF below.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
#[derive(serde::Deserialize)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

// COLORREF packs the channels as 0x00BBGGRR.
#[cfg(target_os = "windows")]
fn colorref(c: &Rgb) -> u32 {
    (c.r as u32) | ((c.g as u32) << 8) | ((c.b as u32) << 16)
}

#[cfg(target_os = "windows")]
fn paint_caption(window: &tauri::WebviewWindow, caption: &Rgb, text: &Rgb) -> Result<(), String> {
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };

    // Tauri hands back an HWND from its own (older) `windows` crate, a distinct
    // type from the one this crate links. They share the same representation
    // (a *mut c_void), so rebuild ours from the raw pointer.
    let raw = window.hwnd().map_err(|e| e.to_string())?;
    let hwnd = HWND(raw.0 as *mut _);

    let caption = COLORREF(colorref(caption));
    let text = COLORREF(colorref(text));
    let size = std::mem::size_of::<COLORREF>() as u32;

    // SAFETY: `hwnd` is a live top-level window and the attribute pointers stay
    // valid for the duration of each synchronous call.
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_COLOR,
            (&caption as *const COLORREF).cast(),
            size,
        )
        .map_err(|e| e.to_string())?;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_TEXT_COLOR,
            (&text as *const COLORREF).cast(),
            size,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Set the caption background and text colour for the calling window. The
/// frontend calls this on mount and whenever the theme changes, passing the
/// resolved --c-bg / --c-text.
#[tauri::command]
pub fn set_titlebar_color(
    window: tauri::WebviewWindow,
    caption: Rgb,
    text: Rgb,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        paint_caption(&window, &caption, &text)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, caption, text);
        Ok(())
    }
}

/// Paint a best-guess caption colour at window-creation time, before the webview
/// has mounted and can report its exact theme. This kills the OS-accent flash on
/// cold start; the frontend re-applies the precise colour a moment later.
pub fn apply_startup_color(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        use tauri::Theme;
        // Mirrors --c-bg / --c-text for the default (untinted) accent in
        // src/core/theme/colors.css. Keep in sync if those primitives change.
        let (caption, text) = match window.theme() {
            Ok(Theme::Light) => (
                Rgb { r: 0xf5, g: 0xf4, b: 0xf1 },
                Rgb { r: 0x37, g: 0x35, b: 0x30 },
            ),
            _ => (
                Rgb { r: 0x14, g: 0x14, b: 0x16 },
                Rgb { r: 0xfa, g: 0xfa, b: 0xfa },
            ),
        };
        if let Err(e) = paint_caption(window, &caption, &text) {
            crate::utils::add_log(format!("⚠️ Failed to set startup titlebar colour: {}", e));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
    }
}
