//! Native PDF page rasterization for thumbnails.
//!
//! macOS renders through PDFKit, the engine the OS already ships, so the
//! desktop bundle carries no PDF library for this. Other platforms report
//! unsupported and the caller keeps the in-webview engine.

/// Renders page `page` (1-based) of `path` to a PNG sized close to
/// `max_width`, preserving the page aspect ratio. Raw PNG bytes are returned
/// so the caller can persist them like any other thumbnail.
#[cfg(target_os = "macos")]
mod macos {
    use std::path::Path;
    use std::sync::mpsc;

    use objc2::rc::autoreleasepool;
    use objc2::AnyThread;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use objc2_foundation::{NSDictionary, NSSize, NSString, NSURL};
    use objc2_pdf_kit::{PDFDisplayBox, PDFDocument};
    use tauri::{ipc::Response, AppHandle};

    #[tauri::command]
    pub fn render_pdf_page_png(
        app: AppHandle,
        path: String,
        page: u32,
        max_width: u32,
    ) -> Result<Response, String> {
        if !Path::new(&path).exists() {
            return Err(format!("PDF file does not exist: {path}"));
        }
        // PDFKit is main-thread only; the command itself runs on the sync
        // threadpool, so this waits without blocking the thread the render needs.
        let (sender, receiver) = mpsc::channel();
        app.run_on_main_thread(move || {
            let result = autoreleasepool(|_| render(&path, page, max_width));
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
        receiver
            .recv()
            .map_err(|error| error.to_string())?
            .map(Response::new)
    }

    #[cfg(test)]
    mod tests {
        use super::render;
        use std::path::Path;

        fn fixture() -> String {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../src/core/tests/test-fixtures/annotation-text-sample.pdf")
                .to_string_lossy()
                .into_owned()
        }

        #[test]
        fn renders_page_one_as_png_at_the_requested_width() {
            let png = render(&fixture(), 1, 240).expect("render page 1");
            assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n", "PNG signature");
            let width = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
            assert_eq!(width, 240);
        }

        #[test]
        fn rejects_a_page_outside_the_document() {
            let error = render(&fixture(), 99, 240).expect_err("page 99 must fail");
            assert!(error.contains("outside"), "unexpected error: {error}");
        }

        #[test]
        fn rejects_a_missing_file() {
            let missing = format!("{}.missing", fixture());
            let error = render(&missing, 1, 240).expect_err("missing file must fail");
            assert!(
                error.contains("could not open"),
                "unexpected error: {error}"
            );
        }
    }

    fn render(path: &str, page: u32, max_width: u32) -> Result<Vec<u8>, String> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let document = unsafe { PDFDocument::initWithURL(PDFDocument::alloc(), &url) }
            .ok_or_else(|| format!("PDFKit could not open {path}"))?;
        let page_count = unsafe { document.pageCount() };
        if page == 0 || page as usize > page_count {
            return Err(format!("Page {page} is outside 1..={page_count} of {path}"));
        }
        let pdf_page = unsafe { document.pageAtIndex(page as usize - 1) }
            .ok_or_else(|| format!("PDFKit could not read page {page} of {path}"))?;

        let max_width = f64::from(max_width.max(1));
        let bounds = unsafe { pdf_page.boundsForBox(PDFDisplayBox::CropBox) };
        let width_pt = f64::max(bounds.size.width, 1.0);
        let height = f64::max(bounds.size.height, 1.0) * (max_width / width_pt);
        let image = unsafe {
            pdf_page.thumbnailOfSize_forBox(NSSize::new(max_width, height), PDFDisplayBox::CropBox)
        };

        // NSImage -> TIFF -> bitmap rep -> PNG: PDFKit hands back an image and
        // PNG is what the thumbnail cache stores.
        let tiff = image
            .TIFFRepresentation()
            .ok_or_else(|| "Thumbnail had no TIFF representation".to_string())?;
        let bitmap = NSBitmapImageRep::imageRepWithData(&tiff)
            .ok_or_else(|| "Could not decode the rendered thumbnail".to_string())?;
        let properties = NSDictionary::new();
        let png = unsafe {
            bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
        }
        .ok_or_else(|| "Could not encode the thumbnail as PNG".to_string())?;
        Ok(png.to_vec())
    }
}

#[cfg(target_os = "macos")]
pub use macos::render_pdf_page_png;

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn render_pdf_page_png(
    _path: String,
    _page: u32,
    _max_width: u32,
) -> Result<tauri::ipc::Response, String> {
    Err("Native PDF rendering is not implemented on this platform".to_string())
}
