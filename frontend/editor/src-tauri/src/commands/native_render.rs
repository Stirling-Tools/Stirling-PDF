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
    use std::cell::OnceCell;
    use std::path::Path;
    use std::ptr;
    use std::sync::mpsc;

    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::AnyObject;
    use objc2::AnyThread;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use objc2_core_foundation::{CFRetained, CGPoint, CGRect, CGSize, CFURL};
    use objc2_core_graphics::{
        CGBitmapContextCreate, CGBitmapContextCreateImage, CGColorSpace, CGContext, CGImage,
        CGImageAlphaInfo, CGImageByteOrderInfo, CGPDFBox, CGPDFDocument, CGPDFPage,
    };
    use objc2_core_image::{CIContext, CIImage};
    use objc2_foundation::{NSDictionary, NSNumber, NSSize, NSString, NSURL};
    use objc2_metal::MTLCreateSystemDefaultDevice;
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
        // No main-thread hop: tiles are CoreGraphics-only and the command runs
        // on the sync threadpool, so concurrent tile requests render in
        // parallel instead of queueing behind one thread.
        render_rect(&path, page, x, y, width, height, scale, ImageFormat::Jpeg).map(Response::new)
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

    thread_local! {
        /// CI contexts are expensive to build (Metal device, pipelines), so one
        /// per thread: renders hop to the main thread, tests run on their own.
        static CI_CONTEXT: OnceCell<Option<Retained<CIContext>>> = const { OnceCell::new() };
    }

    /// The Metal-backed encoder, measured 1.7x faster than ImageIO on photo
    /// tiles (and smaller): the GPU does the JPEG encode.
    fn metal_context() -> Option<Retained<CIContext>> {
        CI_CONTEXT.with(|cell| {
            cell.get_or_init(|| {
                let device = MTLCreateSystemDefaultDevice()?;
                Some(unsafe { CIContext::contextWithMTLDevice(&device) })
            })
            .clone()
        })
    }

    fn encode_jpeg_metal(image: &CGImage) -> Option<Vec<u8>> {
        let context = metal_context()?;
        let space = CGColorSpace::new_device_rgb()?;
        let ci_image = unsafe { CIImage::initWithCGImage(CIImage::alloc(), image) };
        let key = NSString::from_str("kCGImageDestinationLossyCompressionQuality");
        let value: Retained<AnyObject> = NSNumber::new_cgfloat(0.8).into();
        let options = NSDictionary::from_slices(&[&*key], &[&*value]);
        let data = unsafe {
            context.JPEGRepresentationOfImage_colorSpace_options(&ci_image, &space, &options)
        }?;
        Some(data.to_vec())
    }

    /// Below this the Metal context's setup cost outweighs its faster encode:
    /// a 240px thumbnail is quicker through ImageIO, a viewer tile is not.
    const METAL_JPEG_MIN_PIXELS: usize = 400_000;

    fn encode(bitmap: &NSBitmapImageRep, format: ImageFormat) -> Result<Vec<u8>, String> {
        let pixels = bitmap.pixelsWide().max(0) as usize * bitmap.pixelsHigh().max(0) as usize;
        if matches!(format, ImageFormat::Jpeg) && pixels >= METAL_JPEG_MIN_PIXELS {
            if let Some(image) = bitmap.CGImage() {
                if let Some(encoded) = encode_jpeg_metal(&image) {
                    return Ok(encoded);
                }
            }
            // No Metal device, or CI refused the image: ImageIO still works.
        }
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

    /// Draws one tile into a fresh bitmap context. Shared by the encoded and
    /// raw paths so their geometry cannot drift apart.
    ///
    /// Rect space: crop-box normalized, origin at the crop's bottom-left, y up.
    /// Thread safety: opens its own CGPDFDocument per call (measured 0.1ms) and
    /// draws into its own context, so callers can render tiles in parallel.
    #[allow(clippy::too_many_arguments)]
    fn render_tile_context(
        path: &str,
        page: u32,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        scale: f64,
    ) -> Result<CFRetained<CGContext>, String> {
        if !(scale.is_finite() && scale > 0.0) {
            return Err(format!("Tile scale must be positive, got {scale}"));
        }
        if !(width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0) {
            return Err(format!("Tile size must be positive, got {width}x{height}"));
        }
        let (_document, cg_page) = open_cg_page(path, page)?;
        let crop = CGPDFPage::box_rect(Some(&cg_page), CGPDFBox::CropBox);

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

        // No flip here: drawing the page unflipped into this bitmap produces an
        // upright image (verified by decoding the rendered PNG and locating the
        // glyphs); the textbook flip mirrors it. Scale before shifting because
        // CoreGraphics post-multiplies the CTM; a shift applied first would
        // itself be scaled and 2x tiles landed in the wrong place.
        CGContext::scale_ctm(Some(&context), scale, scale);
        CGContext::translate_ctm(Some(&context), -x, -y);
        let box_rect = CGRect::new(
            CGPoint::ZERO,
            CGSize::new(crop.size.width, crop.size.height),
        );
        // CGPDFPageGetDrawingTransform applies /Rotate and absorbs a non-zero
        // MediaBox/CropBox origin, which hand-rolled translation got wrong.
        let box_transform =
            CGPDFPage::drawing_transform(Some(&cg_page), CGPDFBox::CropBox, box_rect, 0, false);
        CGContext::concat_ctm(Some(&context), box_transform);
        // Clip in page space, like the Quartz sample: passing the target rect
        // here clipped a page whose CropBox origin is non-zero.
        CGContext::clip_to_rect(Some(&context), crop);
        CGContext::draw_pdf_page(Some(&context), Some(&cg_page));
        Ok(context)
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
        let context = render_tile_context(path, page, x, y, width, height, scale)?;
        let image = CGBitmapContextCreateImage(Some(&context))
            .ok_or_else(|| "Could not snapshot the tile".to_string())?;
        let bitmap = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &image);
        encode(&bitmap, format)
    }

    /// CoreGraphics twin of `open_page`, for the tile path. Keeps the document
    /// alive alongside the page: CGPDFPage needs its document.
    fn open_cg_page(
        path: &str,
        page: u32,
    ) -> Result<(CFRetained<CGPDFDocument>, CFRetained<CGPDFPage>), String> {
        let url = CFURL::from_file_path(path).ok_or_else(|| format!("Invalid PDF path: {path}"))?;
        let document = CGPDFDocument::with_url(Some(&url))
            .ok_or_else(|| format!("CoreGraphics could not open {path}"))?;
        let count = CGPDFDocument::number_of_pages(Some(&document));
        if page == 0 || page as usize > count {
            return Err(format!("Page {page} is outside 1..={count} of {path}"));
        }
        let cg_page = CGPDFDocument::page(Some(&document), page as usize)
            .ok_or_else(|| format!("CoreGraphics could not read page {page} of {path}"))?;
        Ok((document, cg_page))
    }

    #[cfg(test)]
    mod tests {
        use super::{render, render_rect, ImageFormat};
        use objc2_core_graphics::{
            CGBitmapContextGetBytesPerRow, CGBitmapContextGetData, CGBitmapContextGetHeight,
        };
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
            // Text and annotations sit low on this page; rects are crop
            // normalized with y up, so the content is near y = 210..260.
            let content = render_rect(
                &fixture(),
                1,
                40.0,
                200.0,
                100.0,
                60.0,
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

        /// Renders the fixture two ways to settle the orientation convention:
        /// (a) canonical flip + drawing transform, (b) the same without the flip.
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
            // (10, 320) on the offset page and (60, 350) on the control, so a
            // tile starting exactly at the glyph origin must rasterize the same
            // pixels on both: anything less and the crop offset is not applied.
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

            let offset_tile = content(&offset, 10.0, 320.0);
            let control_tile = content(&control, 60.0, 350.0);
            assert!(
                offset_tile.len() > blank.len(),
                "crop-offset tile ({} bytes) should carry content, blank is {} bytes",
                offset_tile.len(),
                blank.len(),
            );
            assert_eq!(
                offset_tile,
                control_tile,
                "the same glyphs at the same crop-normalized origin must rasterize identically ({} vs {} bytes)",
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

        /// The shared tile pipeline without encoding, for the raw/multi-thread
        /// benches.
        #[cfg(test)]
        fn render_rect_raw(
            path: &str,
            page: u32,
            x: f64,
            y: f64,
            width: f64,
            height: f64,
            scale: f64,
        ) -> Result<Vec<u8>, String> {
            let context = super::render_tile_context(path, page, x, y, width, height, scale)?;
            let bytes_per_row = CGBitmapContextGetBytesPerRow(Some(&context));
            let pixel_height = CGBitmapContextGetHeight(Some(&context));
            let data = CGBitmapContextGetData(Some(&context));
            if data.is_null() {
                return Err("Tile bitmap has no data".to_string());
            }
            let len = bytes_per_row * pixel_height;
            Ok(unsafe { std::slice::from_raw_parts(data as *const u8, len) }.to_vec())
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
                    for (kind, raw) in [("jpg", false), ("raw", true)] {
                        let mut samples = Vec::new();
                        let mut bytes = 0;
                        for _ in 0..7 {
                            let started = Instant::now();
                            let result = if raw {
                                render_rect_raw(&path, 1, x, y, width, height, scale)
                            } else {
                                render_rect(&path, 1, x, y, width, height, scale, ImageFormat::Jpeg)
                            };
                            match result {
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
                            "[bench] tile {label} {name} {width:.0}x{height:.0}pt@{scale:.0}x {kind}: median {median_ms:.1}ms min {min_ms:.1}ms {}KB",
                            bytes / 1024,
                        );
                    }
                }

                // Phase split for one viewer tile: open only, then the whole
                // pipeline without the encoder, then the encoder alone.
                let mut open_samples = Vec::new();
                for _ in 0..7 {
                    let started = Instant::now();
                    let _ = super::open_page(&path, 1);
                    open_samples.push(started.elapsed().as_secs_f64() * 1000.0);
                }
                let (open_median, _) = median(open_samples);

                let mut paint_samples = Vec::new();
                for _ in 0..7 {
                    let started = Instant::now();
                    let _ = render_rect_raw(&path, 1, 0.0, 0.0, 612.0, 396.0, 2.0);
                    paint_samples.push(started.elapsed().as_secs_f64() * 1000.0);
                }
                let (paint_median, _) = median(paint_samples);

                let jpeg = render_rect(&path, 1, 0.0, 0.0, 612.0, 396.0, 2.0, ImageFormat::Jpeg)
                    .map(|v| v.len())
                    .unwrap_or(0);
                let mut encode_samples = Vec::new();
                for _ in 0..7 {
                    let started = Instant::now();
                    let _ = render_rect(&path, 1, 0.0, 0.0, 612.0, 396.0, 2.0, ImageFormat::Jpeg);
                    encode_samples.push(started.elapsed().as_secs_f64() * 1000.0);
                }
                let (total_median, _) = median(encode_samples);
                println!(
                    "[bench] phase {label} half-page@2x: open {open_median:.1}ms, through-pixels {paint_median:.1}ms, with-jpeg {total_median:.1}ms, jpeg {}KB",
                    jpeg / 1024,
                );

                // One viewport at 100% on a 2x display: 2x3 half-page tiles, the
                // work a single scroll frame can ask for.
                let started = Instant::now();
                let mut viewport_bytes = 0;
                for (x, y) in [(0.0, 0.0), (306.0, 0.0), (0.0, 396.0), (306.0, 396.0)] {
                    if let Ok(bytes) =
                        render_rect(&path, 1, x, y, 306.0, 396.0, 2.0, ImageFormat::Jpeg)
                    {
                        viewport_bytes += bytes.len();
                    }
                }
                println!(
                    "[bench] viewport {label} 4 tiles@2x serial: {:.1}ms, {}KB",
                    started.elapsed().as_secs_f64() * 1000.0,
                    viewport_bytes / 1024,
                );

                // The viewer asks for several tiles at once and each Tauri
                // command runs on the threadpool, so this is the shape it gets.
                for threads in [1usize, 2, 4] {
                    let tiles = [(0.0, 0.0), (306.0, 0.0), (0.0, 396.0), (306.0, 396.0)];
                    let started = Instant::now();
                    std::thread::scope(|scope| {
                        for offset in 0..threads {
                            let path = path.clone();
                            scope.spawn(move || {
                                for (index, (tx, ty)) in tiles.iter().enumerate() {
                                    if index % threads != offset {
                                        continue;
                                    }
                                    let _ = render_rect(
                                        &path,
                                        1,
                                        *tx,
                                        *ty,
                                        306.0,
                                        396.0,
                                        2.0,
                                        ImageFormat::Jpeg,
                                    );
                                }
                            });
                        }
                    });
                    println!(
                        "[bench] viewport {label} 4 tiles@2x on {threads} threads: {:.1}ms",
                        started.elapsed().as_secs_f64() * 1000.0,
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
