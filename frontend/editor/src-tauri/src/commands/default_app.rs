use crate::utils::add_log;

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
    use windows::core::HSTRING;
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        IApplicationAssociationRegistration, ApplicationAssociationRegistration,
        ASSOCIATIONTYPE, ASSOCIATIONLEVEL,
    };

    unsafe {
        // Initialize COM for this thread
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        // RPC_E_CHANGED_MODE means COM is already initialized, which is fine
        if hr.is_err() && hr != RPC_E_CHANGED_MODE {
            return Err(format!("Failed to initialize COM: {:?}", hr));
        }

        let result = (|| -> Result<bool, String> {
            // Create the IApplicationAssociationRegistration instance
            let reg: IApplicationAssociationRegistration =
                CoCreateInstance(&ApplicationAssociationRegistration, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| format!("Failed to create COM instance: {}", e))?;

            // Query the current default handler for .pdf extension
            let extension = HSTRING::from(".pdf");

            let default_app = reg.QueryCurrentDefault(
                &extension,
                ASSOCIATIONTYPE(0), // AT_FILEEXTENSION
                ASSOCIATIONLEVEL(1), // AL_EFFECTIVE - gets the effective default (user or machine level)
            )
            .map_err(|e| format!("Failed to query current default: {}", e))?;

            // Convert PWSTR to String
            let default_str = default_app.to_string()
                .map_err(|e| format!("Failed to convert default app string: {}", e))?;

            add_log(format!("Windows PDF handler ProgID: {}", default_str));

            // Check if it contains "Stirling" (case-insensitive)
            // Note: This checks the ProgID registered by the installer
            let is_default = default_str.to_lowercase().contains("stirling");
            Ok(is_default)
        })();

        // Clean up COM
        CoUninitialize();

        result
    }
}

#[cfg(target_os = "windows")]
fn set_default_windows() -> Result<String, String> {
    use std::process::Command;

    // Windows 10+ approach: Open Settings app directly to default apps
    // This is more reliable than COM APIs which require pre-registration
    // ms-settings:defaultapps opens the default apps settings page
    let result = Command::new("cmd")
        .args(["/C", "start", "ms-settings:defaultapps"])
        .output()
        .map_err(|e| format!("Failed to open Windows Settings: {}", e))?;

    if result.status.success() {
        add_log("Opened Windows default apps settings".to_string());
        Ok("opened_dialog".to_string())
    } else {
        let error = String::from_utf8_lossy(&result.stderr);
        add_log(format!("Failed to open settings: {}", error));
        Err(format!("Failed to open default apps settings: {}", error))
    }
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
    use std::process::Command;

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
    use std::process::Command;

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
