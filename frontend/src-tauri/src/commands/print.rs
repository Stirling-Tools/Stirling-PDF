#[cfg(target_os = "macos")]
mod macos {
    use std::path::Path;
    use std::sync::mpsc;

    use objc2::encode::{Encode, Encoding, RefEncode};
    use objc2::rc::{autoreleasepool, Allocated, Retained};
    use objc2::{extern_class, extern_conformance, extern_methods, MainThreadOnly};
    use objc2_app_kit::{NSPrintInfo, NSPrintOperation};
    use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol, NSString, NSURL};
    use tauri::AppHandle;

    #[link(name = "PDFKit", kind = "framework")]
    unsafe extern "C" {}

    #[repr(transparent)]
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
    struct PDFPrintScalingMode(isize);

    impl PDFPrintScalingMode {
        const PAGE_SCALE_DOWN_TO_FIT: Self = Self(2);
    }

    unsafe impl Encode for PDFPrintScalingMode {
        const ENCODING: Encoding = isize::ENCODING;
    }

    unsafe impl RefEncode for PDFPrintScalingMode {
        const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
    }

    extern_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[derive(Debug, PartialEq, Eq, Hash)]
        struct PDFDocument;
    );

    extern_conformance!(
        unsafe impl NSObjectProtocol for PDFDocument {}
    );

    impl PDFDocument {
        extern_methods!(
            #[unsafe(method(initWithURL:))]
            #[unsafe(method_family = init)]
            fn init_with_url(this: Allocated<Self>, url: &NSURL) -> Option<Retained<Self>>;

            #[unsafe(method(printOperationForPrintInfo:scalingMode:autoRotate:))]
            #[unsafe(method_family = none)]
            fn print_operation_for_print_info_scaling_mode_auto_rotate(
                &self,
                print_info: Option<&NSPrintInfo>,
                scaling_mode: PDFPrintScalingMode,
                auto_rotate: bool,
            ) -> Retained<NSPrintOperation>;
        );
    }

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
                let document = PDFDocument::init_with_url(PDFDocument::alloc(mtm), &file_url)
                    .ok_or_else(|| format!("Failed to load PDF for printing: {}", file_path))?;

                let print_info = NSPrintInfo::sharedPrintInfo();
                let print_operation = document.print_operation_for_print_info_scaling_mode_auto_rotate(
                    Some(&print_info),
                    PDFPrintScalingMode::PAGE_SCALE_DOWN_TO_FIT,
                    true,
                );

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
