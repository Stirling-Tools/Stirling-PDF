//! Native PDF page rasterization for thumbnails.
//!
//! macOS renders through PDFKit, the engine the OS already ships, so the
//! desktop bundle carries no PDF library for this. Other platforms report
//! unsupported and the caller keeps the in-webview engine.

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

    #[derive(Clone, Copy)]
    enum ImageFormat {
        /// Benchmark baseline only: thumbnails ship as JPEG, which measured
        /// 4-5x smaller and faster at the sizes a file list asks for.
        #[allow(dead_code)]
        Png,
        Jpeg,
    }

    /// Renders page `page` (1-based) of `path` as a JPEG sized close to
    /// `max_width`, preserving the page aspect ratio, and returns the encoded
    /// bytes so the caller can persist them like any other thumbnail.
    #[tauri::command]
    pub fn render_pdf_page_thumbnail(
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
            let result = autoreleasepool(|_| render(&path, page, max_width, ImageFormat::Jpeg));
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
        use super::{render, ImageFormat};
        use std::path::Path;

        fn fixture() -> String {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../src/core/tests/test-fixtures/annotation-text-sample.pdf")
                .to_string_lossy()
                .into_owned()
        }

        #[test]
        fn renders_page_one_as_png_at_the_requested_width() {
            let png = render(&fixture(), 1, 240, ImageFormat::Png).expect("render page 1");
            assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n", "PNG signature");
            let width = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
            assert_eq!(width, 240);
        }

        #[test]
        fn renders_page_one_as_jpeg_by_default() {
            let jpeg = render(&fixture(), 1, 240, ImageFormat::Jpeg).expect("render page 1");
            assert_eq!(&jpeg[..3], b"\xFF\xD8\xFF", "JPEG start-of-image marker");
            assert!(jpeg.len() > 1_000, "rendered JPEG looks empty");
        }

        #[test]
        fn rejects_a_page_outside_the_document() {
            let error =
                render(&fixture(), 99, 240, ImageFormat::Png).expect_err("page 99 must fail");
            assert!(error.contains("outside"), "unexpected error: {error}");
        }

        /// Cold cost of one thumbnail: document open + raster + PNG encode, as
        /// every call is independent. Run with:
        ///   cargo test --lib commands::native_render -- --ignored --nocapture
        #[test]
        #[ignore = "benchmark; run on demand with --ignored --nocapture"]
        fn bench_render_latency() {
            use std::time::Instant;

            let root = Path::new(env!("CARGO_MANIFEST_DIR"));
            let fixtures = [
                (
                    "annotation-text-sample",
                    root.join("../src/core/tests/test-fixtures/annotation-text-sample.pdf"),
                ),
                ("pages-500", root.join("../.perf-local/pages-500.pdf")),
                ("large-40mb", root.join("../.perf-local/large-40mb.pdf")),
            ];
            for (label, path) in fixtures {
                if !path.exists() {
                    println!("[bench] {label}: fixture missing, skipped");
                    continue;
                }
                let path = path.to_string_lossy().into_owned();
                for width in [120u32, 240, 1224] {
                    for format in [ImageFormat::Png, ImageFormat::Jpeg] {
                        let mut samples = Vec::new();
                        let mut bytes = 0;
                        for _ in 0..7 {
                            let started = Instant::now();
                            match render(&path, 1, width, format) {
                                Ok(encoded) => {
                                    samples.push(started.elapsed().as_secs_f64() * 1000.0);
                                    bytes = encoded.len();
                                }
                                Err(error) => {
                                    println!("[bench] {label} @{width}px failed: {error}");
                                    break;
                                }
                            }
                        }
                        if samples.is_empty() {
                            continue;
                        }
                        samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
                        let kind = match format {
                            ImageFormat::Png => "png",
                            ImageFormat::Jpeg => "jpg",
                        };
                        println!(
                            "[bench] native {label} page1 @{width}px {kind}: median {:.1}ms min {:.1}ms png {}KB",
                            samples[samples.len() / 2],
                            samples[0],
                            bytes / 1024,
                        );
                    }
                }
            }
        }

        #[test]
        fn rejects_a_missing_file() {
            let missing = format!("{}.missing", fixture());
            let error =
                render(&missing, 1, 240, ImageFormat::Png).expect_err("missing file must fail");
            assert!(
                error.contains("could not open"),
                "unexpected error: {error}"
            );
        }
    }

    fn render(
        path: &str,
        page: u32,
        max_width: u32,
        format: ImageFormat,
    ) -> Result<Vec<u8>, String> {
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
        let (file_type, label) = match format {
            ImageFormat::Png => (NSBitmapImageFileType::PNG, "PNG"),
            ImageFormat::Jpeg => (NSBitmapImageFileType::JPEG, "JPEG"),
        };
        let encoded = unsafe { bitmap.representationUsingType_properties(file_type, &properties) };
        let encoded =
            encoded.ok_or_else(|| format!("Could not encode the thumbnail as {label}"))?;
        Ok(encoded.to_vec())
    }
}

#[cfg(target_os = "macos")]
pub use macos::render_pdf_page_thumbnail;

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn render_pdf_page_thumbnail(
    _path: String,
    _page: u32,
    _max_width: u32,
) -> Result<tauri::ipc::Response, String> {
    Err("Native PDF rendering is not implemented on this platform".to_string())
}
