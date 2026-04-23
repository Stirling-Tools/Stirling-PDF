#[cfg(target_os = "macos")]
mod macos {
    use std::path::Path;
    use std::sync::mpsc;

    use objc2::rc::autoreleasepool;
    use objc2::AnyThread;
    use objc2_app_kit::NSPrintInfo;
    use objc2_foundation::{MainThreadMarker, NSString, NSURL};
    use objc2_pdf_kit::{PDFDocument, PDFPrintScalingMode};
    use tauri::AppHandle;

    #[tauri::command]
    pub fn print_pdf_file_native(app: AppHandle, file_path: String, title: Option<String>) -> Result<(), String> {
        if !Path::new(&file_path).exists() {
            return Err(format!("Print file does not exist: {}", file_path));
        }

        let (sender, receiver) = mpsc::channel();
        app.run_on_main_thread(move || {
            let result = autoreleasepool(|_| {
                let mtm = MainThreadMarker::new()
                    .ok_or_else(|| "macOS print must run on the main thread".to_string())?;

                let path_string = NSString::from_str(&file_path);
                let file_url = NSURL::fileURLWithPath(&path_string);
                let document = unsafe { PDFDocument::initWithURL(PDFDocument::alloc(), &file_url) }
                    .ok_or_else(|| format!("Failed to load PDF for printing: {}", file_path))?;

                let print_info = NSPrintInfo::sharedPrintInfo();
                let print_operation = unsafe {
                    document
                        .printOperationForPrintInfo_scalingMode_autoRotate(
                            Some(&print_info),
                            PDFPrintScalingMode::PageScaleDownToFit,
                            true,
                            mtm,
                        )
                }
                .ok_or_else(|| "PDFKit did not create a print operation".to_string())?;

                if let Some(job_title) = title.as_deref() {
                    print_operation.setJobTitle(Some(&NSString::from_str(job_title)));
                }

                print_operation.setShowsPrintPanel(true);
                print_operation.setShowsProgressPanel(true);
                let _ = print_operation.runOperation();
                Ok(())
            });

            let _ = sender.send(result);
        }).map_err(|error| error.to_string())?;

        receiver
            .recv()
            .map_err(|error| error.to_string())?
    }
}

#[cfg(target_os = "macos")]
pub use macos::print_pdf_file_native;

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn print_pdf_file_native(_file_path: String, _title: Option<String>) -> Result<(), String> {
    Err("Native PDF printing is only implemented on macOS".to_string())
}
