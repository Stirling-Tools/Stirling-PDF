use crate::utils::add_log;

#[cfg(any(target_os = "windows", target_os = "linux"))]
use std::process::Command;

/// Check if Stirling PDF is the default PDF handler
#[tauri::command]
pub fn is_default_pdf_handler() -> Result<bool, String> {
    add_log("🔍 Checking if app is default PDF handler".to_string());

    #[cfg(target_os = "windows")]
    {
        check_default_windows()
    }

    #[cfg(target_os = "macos")]
    {
        check_default_macos()
    }

    #[cfg(target_os = "linux")]
    {
        check_default_linux()
    }
}

/// Attempt to set/prompt for Stirling PDF as default PDF handler
#[tauri::command]
pub fn set_as_default_pdf_handler() -> Result<String, String> {
    add_log("⚙️ Attempting to set as default PDF handler".to_string());

    #[cfg(target_os = "windows")]
    {
        set_default_windows()
    }

    #[cfg(target_os = "macos")]
    {
        set_default_macos()
    }

    #[cfg(target_os = "linux")]
    {
        set_default_linux()
    }
}

// ============================================================================
// Windows Implementation
// ============================================================================

#[cfg(target_os = "windows")]
fn check_default_windows() -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Query the default handler for .pdf extension
    let output = Command::new("cmd")
        .args(["/C", "assoc .pdf"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to check default app: {}", e))?;

    let assoc = String::from_utf8_lossy(&output.stdout);
    add_log(format!("Windows PDF association: {}", assoc.trim()));

    // Get the ProgID for .pdf files
    if let Some(prog_id) = assoc.trim().strip_prefix(".pdf=") {
        // Query what application handles this ProgID
        let output = Command::new("cmd")
            .args(["/C", &format!("ftype {}", prog_id)])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to query file type: {}", e))?;

        let ftype = String::from_utf8_lossy(&output.stdout);
        add_log(format!("Windows file type: {}", ftype.trim()));

        // Check if it contains "Stirling" or our app name
        let is_default = ftype.to_lowercase().contains("stirling");
        Ok(is_default)
    } else {
        Ok(false)
    }
}

#[cfg(target_os = "windows")]
fn set_default_windows() -> Result<String, String> {
    // On Windows 10+, we need to open the Default Apps settings
    // as programmatic setting requires a signed installer
    Command::new("cmd")
        .args(["/C", "start", "ms-settings:defaultapps"])
        .spawn()
        .map_err(|e| format!("Failed to open default apps settings: {}", e))?;

    add_log("Opened Windows Default Apps settings".to_string());
    Ok("opened_settings".to_string())
}

// ============================================================================
// macOS Implementation (using LaunchServices framework)
// ============================================================================

#[cfg(target_os = "macos")]
fn check_default_macos() -> Result<bool, String> {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};
    use std::os::raw::c_int;

    // Define the LSCopyDefaultRoleHandlerForContentType function
    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: c_int,
        ) -> CFStringRef;
    }

    const K_LS_ROLES_ALL: c_int = 0xFFFFFFFF_u32 as c_int;

    unsafe {
        // Query the default handler for "com.adobe.pdf" (PDF UTI - standard macOS identifier)
        let pdf_uti = CFString::new("com.adobe.pdf");
        let handler_ref = LSCopyDefaultRoleHandlerForContentType(pdf_uti.as_concrete_TypeRef(), K_LS_ROLES_ALL);

        if handler_ref.is_null() {
            add_log("No default PDF handler found".to_string());
            return Ok(false);
        }

        let handler = CFString::wrap_under_create_rule(handler_ref);
        let handler_str = handler.to_string();
        add_log(format!("macOS PDF handler: {}", handler_str));

        // Check if it's our bundle identifier
        let is_default = handler_str == "stirling.pdf.dev";
        Ok(is_default)
    }
}

#[cfg(target_os = "macos")]
fn set_default_macos() -> Result<String, String> {
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};
    use std::os::raw::c_int;

    // Define the LSSetDefaultRoleHandlerForContentType function
    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: c_int,
            handler_bundle_id: CFStringRef,
        ) -> c_int; // OSStatus
    }

    const K_LS_ROLES_ALL: c_int = 0xFFFFFFFF_u32 as c_int;

    unsafe {
        // Set our app as the default handler for PDF files
        let pdf_uti = CFString::new("com.adobe.pdf");
        let our_bundle_id = CFString::new("stirling.pdf.dev");

        let status = LSSetDefaultRoleHandlerForContentType(
            pdf_uti.as_concrete_TypeRef(),
            K_LS_ROLES_ALL,
            our_bundle_id.as_concrete_TypeRef(),
        );

        if status == 0 {
            add_log("Successfully triggered default app dialog".to_string());
            Ok("set_successfully".to_string())
        } else {
            let error_msg = format!("LaunchServices returned status: {}", status);
            add_log(error_msg.clone());
            Err(error_msg)
        }
    }
}

// ============================================================================
// Linux Implementation
// ============================================================================

#[cfg(target_os = "linux")]
fn check_default_linux() -> Result<bool, String> {
    // Use xdg-mime to check the default application for PDF files
    let output = Command::new("xdg-mime")
        .args(["query", "default", "application/pdf"])
        .output()
        .map_err(|e| format!("Failed to check default app: {}", e))?;

    let handler = String::from_utf8_lossy(&output.stdout);
    add_log(format!("Linux PDF handler: {}", handler.trim()));

    // Check if it's our .desktop file
    let is_default = handler.trim() == "stirling-pdf.desktop";
    Ok(is_default)
}

#[cfg(target_os = "linux")]
fn set_default_linux() -> Result<String, String> {
    // Use xdg-mime to set the default application for PDF files
    let result = Command::new("xdg-mime")
        .args(["default", "stirling-pdf.desktop", "application/pdf"])
        .output()
        .map_err(|e| format!("Failed to set default app: {}", e))?;

    if result.status.success() {
        add_log("Set as default PDF handler on Linux".to_string());
        Ok("set_successfully".to_string())
    } else {
        let error = String::from_utf8_lossy(&result.stderr);
        add_log(format!("Failed to set default: {}", error));
        Err(format!("Failed to set as default: {}", error))
    }
}
