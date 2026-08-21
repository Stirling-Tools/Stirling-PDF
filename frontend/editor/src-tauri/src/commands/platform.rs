use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DesktopOS {
    MacOS,
    Windows,
    Linux,
    Unknown,
}

#[tauri::command]
pub fn get_desktop_os() -> DesktopOS {
    match std::env::consts::OS {
        "macos" => DesktopOS::MacOS,
        "windows" => DesktopOS::Windows,
        "linux" => DesktopOS::Linux,
        _ => DesktopOS::Unknown,
    }
}
