//! Native PDF rasterization for the desktop viewer.
//!
//! macOS renders through PDFKit, the engine the OS already ships, so the
//! desktop bundle carries no PDF library for this. Other platforms report
//! unsupported and the caller keeps the in-webview engine.
//!
//! Two shapes are exposed: a whole page scaled to a width (file-list
//! thumbnails) and one rectangular region at a pixel scale (viewer tiles).

#[cfg(target_os = "macos")]
mod macos {
    use std::path::Path;
    use std::ptr;
    use std::sync::mpsc;

    use objc2::rc::{autoreleasepool, Retained};
    use objc2::AnyThread;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_core_graphics::{
        CGBitmapContextCreate, CGBitmapContextCreateImage, CGColorSpace, CGContext,
        CGImageAlphaInfo, CGImageByteOrderInfo,
    };
    use objc2_foundation::{NSDictionary, NSSize, NSString, NSURL};
    use objc2_pdf_kit::{PDFDisplayBox, PDFDocument, PDFPage};
    use tauri::{ipc::Response, AppHandle};

    #[derive(Clone, Copy)]
    enum ImageFormat {
        /// Benchmark baseline only: shipped images are JPEG, which measured
        /// 4-5x smaller and faster at the sizes a viewer asks for.
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

    /// Renders one region of a page at `scale` pixels per point as a JPEG.
    /// `rect` is page-space points with the crop-box origin at (0, 0) (the
    /// space tiles are laid out in), and the bitmap's top-left is the rect's
    /// top-left, so tiles line up when the viewer stitches them.
    #[tauri::command]
    #[allow(clippy::too_many_arguments)]
    pub fn render_pdf_rect(
        app: AppHandle,
        path: String,
        page: u32,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        scale: f64,
    ) -> Result<Response, String> {
        if !Path::new(&path).exists() {
            return Err(format!("PDF file does not exist: {path}"));
        }
        let (sender, receiver) = mpsc::channel();
        app.run_on_main_thread(move || {
            let result = autoreleasepool(|_| {
                render_rect(&path, page, x, y, width, height, scale, ImageFormat::Jpeg)
            });
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
        receiver
            .recv()
            .map_err(|error| error.to_string())?
            .map(Response::new)
    }

    /// The document is returned alongside the page: PDFPage's link back to its
    /// document is weak, and drawing through a page whose document is gone
    /// renders nothing.
    fn open_page(
        path: &str,
        page: u32,
    ) -> Result<(Retained<PDFDocument>, Retained<PDFPage>), String> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let document = unsafe { PDFDocument::initWithURL(PDFDocument::alloc(), &url) }
            .ok_or_else(|| format!("PDFKit could not open {path}"))?;
        let page_count = unsafe { document.pageCount() };
        if page == 0 || page as usize > page_count {
            return Err(format!("Page {page} is outside 1..={page_count} of {path}"));
        }
        let pdf_page = unsafe { document.pageAtIndex(page as usize - 1) }
            .ok_or_else(|| format!("PDFKit could not read page {page} of {path}"))?;
        Ok((document, pdf_page))
    }

    fn encode(bitmap: &NSBitmapImageRep, format: ImageFormat) -> Result<Vec<u8>, String> {
        let properties = NSDictionary::new();
        let (file_type, label) = match format {
            ImageFormat::Png => (NSBitmapImageFileType::PNG, "PNG"),
            ImageFormat::Jpeg => (NSBitmapImageFileType::JPEG, "JPEG"),
        };
        let encoded = unsafe { bitmap.representationUsingType_properties(file_type, &properties) };
        let encoded = encoded.ok_or_else(|| format!("Could not encode the image as {label}"))?;
        Ok(encoded.to_vec())
    }

    fn render(
        path: &str,
        page: u32,
        max_width: u32,
        format: ImageFormat,
    ) -> Result<Vec<u8>, String> {
        let (_document, pdf_page) = open_page(path, page)?;
        let max_width = f64::from(max_width.max(1));
        let bounds = unsafe { pdf_page.boundsForBox(PDFDisplayBox::CropBox) };
        let width_pt = f64::max(bounds.size.width, 1.0);
        let height = f64::max(bounds.size.height, 1.0) * (max_width / width_pt);
        let image = unsafe {
            pdf_page.thumbnailOfSize_forBox(NSSize::new(max_width, height), PDFDisplayBox::CropBox)
        };
        let tiff = image
            .TIFFRepresentation()
            .ok_or_else(|| "Thumbnail had no TIFF representation".to_string())?;
        let bitmap = NSBitmapImageRep::imageRepWithData(&tiff)
            .ok_or_else(|| "Could not decode the rendered thumbnail".to_string())?;
        encode(&bitmap, format)
    }

    #[allow(clippy::too_many_arguments)]
    fn render_rect(
        path: &str,
        page: u32,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        scale: f64,
        format: ImageFormat,
    ) -> Result<Vec<u8>, String> {
        if !(scale.is_finite() && scale > 0.0) {
            return Err(format!("Tile scale must be positive, got {scale}"));
        }
        if !(width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0) {
            return Err(format!("Tile size must be positive, got {width}x{height}"));
        }
        let (_document, pdf_page) = open_page(path, page)?;

        let pixel_width = (width * scale).ceil().max(1.0) as usize;
        let pixel_height = (height * scale).ceil().max(1.0) as usize;
        let space =
            CGColorSpace::new_device_rgb().ok_or_else(|| "No RGB color space".to_string())?;
        let bitmap_info =
            CGImageAlphaInfo::PremultipliedFirst.0 | CGImageByteOrderInfo::Order32Little.0;
        let context = unsafe {
            CGBitmapContextCreate(
                ptr::null_mut(),
                pixel_width,
                pixel_height,
                8,
                pixel_width * 4,
                Some(&space),
                bitmap_info,
            )
        }
        .ok_or_else(|| "Could not create the tile bitmap".to_string())?;

        // Pages may paint nothing behind their content; JPEG has no alpha, so
        // start from white or the unpainted area encodes as black.
        CGContext::set_rgb_fill_color(Some(&context), 1.0, 1.0, 1.0, 1.0);
        CGContext::fill_rect(
            Some(&context),
            CGRect::new(
                CGPoint::ZERO,
                CGSize::new(pixel_width as f64, pixel_height as f64),
            ),
        );

        // Callers hand rects in crop-box-normalized space (origin at 0, 0).
        // drawWithBox puts the crop box origin at the context origin (pinned
        // against the cropbox-offset fixture), leaving the bottom-left to
        // top-left flip and the rect shift.
        CGContext::translate_ctm(Some(&context), 0.0, pixel_height as f64);
        CGContext::scale_ctm(Some(&context), scale, -scale);
        CGContext::translate_ctm(Some(&context), -x, -y);
        unsafe { pdf_page.drawWithBox_toContext(PDFDisplayBox::CropBox, &context) };

        let image = CGBitmapContextCreateImage(Some(&context))
            .ok_or_else(|| "Could not snapshot the tile".to_string())?;
        let bitmap = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &image);
        encode(&bitmap, format)
    }

    #[cfg(test)]
    mod tests {
        use super::{render, render_rect, ImageFormat};
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
        fn renders_a_tile_at_scale_one_to_one() {
            let png = render_rect(&fixture(), 1, 0.0, 0.0, 40.0, 30.0, 2.0, ImageFormat::Png)
                .expect("render tile");
            assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n", "PNG signature");
            let width = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
            let height = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
            assert_eq!((width, height), (80, 60), "pixels = points * scale");
        }

        #[test]
        fn tile_pixels_are_not_blank() {
            // A rect outside the page clips to white; a rect over the body must
            // differ from it, else the page was never drawn (e.g. its document
            // was dropped before the draw call).
            let blank = render_rect(
                &fixture(),
                1,
                5000.0,
                5000.0,
                100.0,
                100.0,
                2.0,
                ImageFormat::Png,
            )
            .expect("render blank tile");
            let content = render_rect(
                &fixture(),
                1,
                40.0,
                40.0,
                100.0,
                100.0,
                2.0,
                ImageFormat::Png,
            )
            .expect("render content tile");
            assert!(
                content.len() > blank.len(),
                "content tile ({} bytes) should carry more than a blank one ({} bytes)",
                content.len(),
                blank.len(),
            );
        }

        /// Renders the glyphs from the crop-offset fixture and its control at
        /// the same crop-normalized spot: the offset page's CropBox starts at
        /// (50, 30), so a missing offset correction samples the wrong region
        /// and the two tiles stop matching.
        #[test]
        fn tiles_a_page_whose_crop_box_is_offset() {
            let root =
                Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/core/tests/test-fixtures");
            let offset = root
                .join("cropbox-offset.pdf")
                .to_string_lossy()
                .into_owned();
            let control = root
                .join("cropbox-control.pdf")
                .to_string_lossy()
                .into_owned();

            // "Hi" is at PDF (60, 350). Normalized to the crop box that is
            // (10, 320) on the offset page and (60, 350) on the control.
            let content = |path: &str, x: f64, y: f64| {
                render_rect(path, 1, x, y, 40.0, 45.0, 2.0, ImageFormat::Png)
                    .expect("render content tile")
            };
            let blank = render_rect(
                &offset,
                1,
                5000.0,
                5000.0,
                40.0,
                45.0,
                2.0,
                ImageFormat::Png,
            )
            .expect("render blank tile");

            let offset_tile = content(&offset, 5.0, 300.0);
            let control_tile = content(&control, 55.0, 330.0);
            assert!(
                offset_tile.len() > blank.len(),
                "crop-offset tile ({} bytes) should carry content, blank is {} bytes",
                offset_tile.len(),
                blank.len(),
            );
            let ratio = offset_tile.len() as f64 / control_tile.len() as f64;
            assert!(
                (0.75..1.25).contains(&ratio),
                "offset tile ({} bytes) should match the control's content ({} bytes)",
                offset_tile.len(),
                control_tile.len(),
            );
        }

        #[test]
        fn renders_an_offset_tile_at_its_own_size() {
            let png = render_rect(&fixture(), 1, 10.0, 20.0, 15.0, 15.0, 4.0, ImageFormat::Png)
                .expect("render tile");
            let width = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
            let height = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
            assert_eq!((width, height), (60, 60));
        }

        #[test]
        fn rejects_a_bad_tile_geometry() {
            let error = render_rect(&fixture(), 1, 0.0, 0.0, 10.0, 10.0, 0.0, ImageFormat::Png)
                .expect_err("zero scale must fail");
            assert!(error.contains("positive"), "unexpected error: {error}");
        }

        #[test]
        fn rejects_a_page_outside_the_document() {
            let error =
                render(&fixture(), 99, 240, ImageFormat::Png).expect_err("page 99 must fail");
            assert!(error.contains("outside"), "unexpected error: {error}");
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

        /// Cold cost of one render: document open + raster + encode, as every
        /// call is independent. Run with:
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

            let median = |mut samples: Vec<f64>| {
                samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
                (samples[samples.len() / 2], samples[0])
            };

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
                        let (median_ms, min_ms) = median(samples);
                        let kind = match format {
                            ImageFormat::Png => "png",
                            ImageFormat::Jpeg => "jpg",
                        };
                        println!(
                            "[bench] page {label} @{width}px {kind}: median {median_ms:.1}ms min {min_ms:.1}ms {}KB",
                            bytes / 1024,
                        );
                    }
                }
                // Viewer-shaped tiles: a 612x792pt page at scale 2 (zoom 100%
                // on a 2x display) split into halves and quarters, plus one
                // small patch to show the fixed cost.
                let tiles = [
                    ("half-page", 0.0, 0.0, 612.0, 396.0, 2.0),
                    ("quarter-page", 306.0, 396.0, 306.0, 396.0, 2.0),
                    ("patch-256", 100.0, 100.0, 128.0, 128.0, 2.0),
                    ("full-page@2x", 0.0, 0.0, 612.0, 792.0, 2.0),
                ];
                for (name, x, y, width, height, scale) in tiles {
                    let mut samples = Vec::new();
                    let mut bytes = 0;
                    for _ in 0..7 {
                        let started = Instant::now();
                        match render_rect(&path, 1, x, y, width, height, scale, ImageFormat::Jpeg) {
                            Ok(encoded) => {
                                samples.push(started.elapsed().as_secs_f64() * 1000.0);
                                bytes = encoded.len();
                            }
                            Err(error) => {
                                println!("[bench] {label} {name} failed: {error}");
                                break;
                            }
                        }
                    }
                    if samples.is_empty() {
                        continue;
                    }
                    let (median_ms, min_ms) = median(samples);
                    println!(
                        "[bench] tile {label} {name} {width:.0}x{height:.0}pt@{scale:.0}x: median {median_ms:.1}ms min {min_ms:.1}ms {}KB",
                        bytes / 1024,
                    );
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
pub use macos::{render_pdf_page_thumbnail, render_pdf_rect};

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn render_pdf_page_thumbnail(
    _path: String,
    _page: u32,
    _max_width: u32,
) -> Result<tauri::ipc::Response, String> {
    Err("Native PDF rendering is not implemented on this platform".to_string())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn render_pdf_rect(
    _path: String,
    _page: u32,
    _x: f64,
    _y: f64,
    _width: f64,
    _height: f64,
    _scale: f64,
) -> Result<tauri::ipc::Response, String> {
    Err("Native PDF rendering is not implemented on this platform".to_string())
}
