/// Multi-platform file opening handler
/// 
/// This module provides unified file opening support across platforms:
/// - macOS: Uses native NSApplication delegate (proper Apple Events)
/// - Windows/Linux: Uses command line arguments (fallback approach)
/// - All platforms: Runtime event handling via Tauri events

use crate::utils::add_log;
use crate::commands::set_opened_file;
use tauri::AppHandle;


/// Initialize file handling for the current platform
pub fn initialize_file_handler(app: &AppHandle<tauri::Wry>) {
    add_log("🔧 Initializing file handler...".to_string());
    
    // Platform-specific initialization
    #[cfg(target_os = "macos")]
    {
        add_log("🍎 Using macOS native file handler".to_string());
        macos_native::register_open_file_handler(app);
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        add_log("🖥️ Using command line argument file handler".to_string());
        let _ = app; // Suppress unused variable warning
    }
    
    // Universal: Check command line arguments (works on all platforms)
    check_command_line_args();
}

/// Early initialization for macOS delegate registration
pub fn early_init() {
    #[cfg(target_os = "macos")]
    {
        add_log("🔄 Early macOS initialization...".to_string());
        macos_native::register_delegate_early();
    }
}

/// Check command line arguments for file paths (universal fallback)
fn check_command_line_args() {
    let args: Vec<String> = std::env::args().collect();
    add_log(format!("🔍 DEBUG: All command line args: {:?}", args));
    
    // Check command line arguments for file opening
    for (i, arg) in args.iter().enumerate() {
        add_log(format!("🔍 DEBUG: Arg {}: {}", i, arg));
        if i > 0 && arg.ends_with(".pdf") && std::path::Path::new(arg).exists() {
            add_log(format!("📂 File argument detected: {}", arg));
            set_opened_file(arg.clone());
            break; // Only handle the first PDF file
        }
    }
}

/// Handle runtime file open events (for future single-instance support)
#[allow(dead_code)]
pub fn handle_runtime_file_open(file_path: String) {
    if file_path.ends_with(".pdf") && std::path::Path::new(&file_path).exists() {
        add_log(format!("📂 Runtime file open: {}", file_path));
        set_opened_file(file_path);
    }
}

#[cfg(target_os = "macos")]
mod macos_native {
    use objc::{class, msg_send, sel, sel_impl};
    use objc::runtime::{Class, Object, Sel};
    use cocoa::appkit::NSApplication;
    use cocoa::base::{id, nil};
    use once_cell::sync::Lazy;
    use std::sync::Mutex;
    use tauri::{AppHandle, Emitter};
    
    use crate::utils::add_log;
    use crate::commands::set_opened_file;
    
    // Static app handle storage
    static APP_HANDLE: Lazy<Mutex<Option<AppHandle<tauri::Wry>>>> = Lazy::new(|| Mutex::new(None));
    
    // Store files opened during launch
    static LAUNCH_FILES: Lazy<Mutex<Vec<String>>> = Lazy::new(|| Mutex::new(Vec::new()));
    
    
    extern "C" fn open_file(_self: &Object, _cmd: Sel, _sender: id, filename: id) -> bool {
        unsafe {
            let cstr = {
                let bytes: *const std::os::raw::c_char = msg_send![filename, UTF8String];
                std::ffi::CStr::from_ptr(bytes)
            };
            if let Ok(path) = cstr.to_str() {
                add_log(format!("📂 macOS native file open event: {}", path));
                if path.ends_with(".pdf") {
                    // Always set the opened file for command-line interface
                    set_opened_file(path.to_string());
                    
                    if let Some(app) = APP_HANDLE.lock().unwrap().as_ref() {
                        // App is running, emit event immediately
                        add_log(format!("✅ App running, emitting file event: {}", path));
                        let _ = app.emit("macos://open-file", path.to_string());
                    } else {
                        // App not ready yet, store for later processing
                        add_log(format!("🚀 App not ready, storing file for later: {}", path));
                        LAUNCH_FILES.lock().unwrap().push(path.to_string());
                    }
                }
            }
        }
        true
    }
    
    // Register the delegate immediately when the module loads
    pub fn register_delegate_early() {
        add_log("🔧 Registering macOS delegate early...".to_string());
        
        unsafe {
            let delegate_class = Class::get("StirlingAppDelegate").unwrap_or_else(|| {
                let superclass = class!(NSObject);
                let mut decl = objc::declare::ClassDecl::new("StirlingAppDelegate", superclass).unwrap();
                
                // Add file opening delegate method
                decl.add_method(
                    sel!(application:openFile:),
                    open_file as extern "C" fn(&Object, Sel, id, id) -> bool
                );
                
                decl.register()
            });
    
            let delegate: id = msg_send![delegate_class, new];
            let ns_app = NSApplication::sharedApplication(nil);
            let _: () = msg_send![ns_app, setDelegate:delegate];
        }
        
        add_log("✅ macOS delegate registered early".to_string());
    }
    
    pub fn register_open_file_handler(app: &AppHandle<tauri::Wry>) {
        add_log("🔧 Connecting app handle to file handler...".to_string());
        
        // Store the app handle 
        *APP_HANDLE.lock().unwrap() = Some(app.clone());
        
        // Process any files that were opened during launch
        let launch_files = {
            let mut files = LAUNCH_FILES.lock().unwrap();
            let result = files.clone();
            files.clear();
            result
        };
        
        for file_path in launch_files {
            add_log(format!("📂 Processing stored launch file: {}", file_path));
            set_opened_file(file_path.clone());
            let _ = app.emit("macos://open-file", file_path);
        }
        
        add_log("✅ macOS file handler connected successfully".to_string());
    }
}