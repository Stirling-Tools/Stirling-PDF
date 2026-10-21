package stirling.software.SPDF.service.ocr;

import static org.bytedeco.leptonica.global.leptonica.kernelCreateFromString;
import static org.bytedeco.leptonica.global.leptonica.kernelDestroy;
import static org.bytedeco.leptonica.global.leptonica.pixConvertRGBToLuminance;
import static org.bytedeco.leptonica.global.leptonica.pixConvolve;
import static org.bytedeco.leptonica.global.leptonica.pixDestroy;
import static org.bytedeco.leptonica.global.leptonica.pixFindSkewAndDeskew;
import static org.bytedeco.leptonica.global.leptonica.pixGetDepth;
import static org.bytedeco.leptonica.global.leptonica.pixRotateOrth;
import static org.bytedeco.leptonica.global.leptonica.pixSetResolution;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.CCITTFactory;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.bytedeco.javacpp.BytePointer;
import org.bytedeco.javacpp.FloatPointer;
import org.bytedeco.javacpp.IntPointer;
import org.bytedeco.javacpp.PointerPointer;
import org.bytedeco.leptonica.L_KERNEL;
import org.bytedeco.leptonica.PIX;
import org.bytedeco.tesseract.TessBaseAPI;
import org.bytedeco.tesseract.TessPDFRenderer;
import org.bytedeco.tesseract.global.tesseract;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.model.RenderResult;

/**
 * Runs Tesseract in-process through JavaCPP, so OCR works where the tesseract CLI is not installed
 * (the desktop app bundles only a JRE). It mirrors OCRmyPDF's pipeline: pages are rendered with
 * pdfium (which, unlike a PDFBox document, can be shared by parallel workers), optionally turned
 * upright with Tesseract OSD and deskewed with Leptonica, then OCRed in parallel, one Tesseract
 * instance per worker thread. Tesseract sees a lightly smoothed copy of each page: a 3x3 Gaussian
 * removes scan speckle it otherwise reads as glyphs (noisy test scans went from 94% to 100% word
 * recall, with no loss on clean, small or low-resolution text). PDFBox work happens on the calling
 * thread afterwards, because PDFBox documents are not thread-safe.
 *
 * <p>Availability is settled once at startup: the native libraries must load and the tessdata
 * folder must hold at least one language, otherwise the {@value #GROUP} endpoint group is disabled.
 * Concurrent jobs share the tesseract CLI's session limit.
 */
@Slf4j
@Service
public class NativeTesseractService {

    public static final String GROUP = "TesseractNative";

    /** OCRmyPDF's default --rotate-pages-threshold. */
    static final float OSD_MIN_CONFIDENCE = 14f;

    /** Below this Leptonica's estimate is noise; straightening would only blur the page. */
    private static final float MIN_DESKEW_DEGREES = 0.1f;

    private final RuntimePathConfig runtimePathConfig;
    private final EndpointConfiguration endpointConfiguration;
    private final Semaphore sessions;
    private volatile CompletableFuture<Boolean> nativesLoaded =
            CompletableFuture.completedFuture(false);

    public NativeTesseractService(
            ApplicationProperties applicationProperties,
            RuntimePathConfig runtimePathConfig,
            EndpointConfiguration endpointConfiguration) {
        this.runtimePathConfig = runtimePathConfig;
        this.endpointConfiguration = endpointConfiguration;
        this.sessions =
                new Semaphore(
                        applicationProperties
                                .getProcessExecutor()
                                .getSessionLimit()
                                .getTesseractSessionLimit(),
                        true);
    }

    @PostConstruct
    void probe() {
        if (!hasLanguage()) {
            disableGroup();
            return;
        }
        // Loading takes seconds (the first run also unpacks the libraries), so it runs off the
        // startup path; isAvailable() waits for it.
        CompletableFuture<Boolean> loading = new CompletableFuture<>();
        nativesLoaded = loading;
        Thread.ofVirtual()
                .name("tesseract-native-load")
                .start(
                        () -> {
                            boolean loaded = loadNatives();
                            if (!loaded) disableGroup();
                            loading.complete(loaded);
                        });
    }

    public boolean isAvailable() {
        return nativesLoaded.join();
    }

    private void disableGroup() {
        endpointConfiguration.disableGroup(GROUP, EndpointConfiguration.DisableReason.DEPENDENCY);
    }

    /**
     * OCRs {@code document}, which must be loaded from {@code pdfFile}, in place and returns the
     * sidecar text, pages separated by form feeds. Pages that already have text are skipped unless
     * {@code options.force()}.
     */
    public String ocrDocument(
            Path pdfFile,
            PDDocument document,
            List<String> languages,
            OcrOptions options,
            int dpi,
            Path workDir)
            throws IOException, InterruptedException {
        int pageCount = document.getNumberOfPages();
        String[] sidecar = new String[pageCount];
        List<Integer> ocrPages = new ArrayList<>();
        PDFTextStripper stripper = new PDFTextStripper();
        for (int i = 0; i < pageCount; i++) {
            if (!options.force() && pageHasText(stripper, document, i)) {
                sidecar[i] = "[OCR skipped on page " + (i + 1) + "]";
            } else {
                ocrPages.add(i);
            }
        }

        if (!ocrPages.isEmpty()) {
            List<PageResult> results =
                    recognise(pdfFile, document, ocrPages, languages, options, dpi, workDir);
            for (PageResult result : results) {
                apply(document, result);
                sidecar[result.index()] = result.text();
            }
        }
        if (options.removeImages()) OcrOutputOptimizer.removeImages(document);
        long saved = OcrOutputOptimizer.deflateJpegs(document);
        if (saved > 0) log.debug("Re-wrapping JPEGs in Flate saved {} bytes", saved);
        return String.join("\f", sidecar);
    }

    /** One OCRed page, ready for the PDFBox thread. */
    private record PageResult(
            int index,
            Path textLayer,
            String text,
            OcrPageImages.Encoded replacement,
            int rotate) {}

    private List<PageResult> recognise(
            Path pdfFile,
            PDDocument document,
            List<Integer> pages,
            List<String> languages,
            OcrOptions options,
            int dpi,
            Path workDir)
            throws IOException, InterruptedException {
        String tessData = runtimePathConfig.getTessDataPath();
        boolean osd = options.rotatePages() && Files.exists(Path.of(tessData, "osd.traineddata"));
        if (options.rotatePages() && !osd) {
            log.warn("Rotate pages requested but osd.traineddata is missing from {}", tessData);
        }
        // Force and deskew replace the page with what was OCRed, so colour must survive.
        boolean keepColour = options.force() || options.deskew();
        int workers = workerCount(pages.size(), document.getPage(pages.get(0)), dpi, keepColour);
        String language = String.join("+", languages);

        sessions.acquire();
        Queue<Worker> started = new ConcurrentLinkedQueue<>();
        ThreadLocal<Worker> local = new ThreadLocal<>();
        AtomicInteger threadIds = new AtomicInteger();
        ExecutorService pool =
                Executors.newFixedThreadPool(
                        workers,
                        r -> {
                            Thread t = new Thread(r, "ocr-worker-" + threadIds.incrementAndGet());
                            t.setDaemon(true);
                            return t;
                        });
        ReentrantLock renderLock = new ReentrantLock();
        try (PdfDocument pdf = PdfDocument.open(pdfFile)) {
            List<Future<PageResult>> futures = new ArrayList<>();
            for (int index : pages) {
                futures.add(
                        pool.submit(
                                () -> {
                                    Worker worker = local.get();
                                    if (worker == null) {
                                        worker = new Worker(tessData, language, osd);
                                        started.add(worker);
                                        local.set(worker);
                                    }
                                    RenderResult page;
                                    renderLock.lock();
                                    try (PdfPage p = pdf.page(index)) {
                                        page = p.renderAt(dpi);
                                    } finally {
                                        renderLock.unlock();
                                    }
                                    return worker.process(
                                            index, page, dpi, keepColour, options, workDir);
                                }));
            }
            List<PageResult> results = new ArrayList<>(futures.size());
            for (Future<PageResult> future : futures) {
                try {
                    results.add(future.get());
                } catch (ExecutionException e) {
                    futures.forEach(f -> f.cancel(true));
                    Throwable cause = e.getCause();
                    if (cause instanceof IOException io) throw io;
                    if (cause instanceof RuntimeException re) throw re;
                    throw new IOException("OCR failed", cause);
                }
            }
            return results;
        } finally {
            pool.shutdownNow();
            pool.awaitTermination(1, TimeUnit.MINUTES);
            started.forEach(Worker::close);
            sessions.release();
        }
    }

    /**
     * One worker per core, as OCRmyPDF's --jobs defaults to, but never more than a quarter of the
     * heap can hold in page images at once (the desktop JVM runs with -Xmx2g).
     */
    static int workerCount(int pages, PDPage sample, int dpi, boolean colour) {
        PDRectangle box = sample.getCropBox();
        long pixels = (long) (box.getWidth() / 72 * dpi) * (long) (box.getHeight() / 72 * dpi);
        long perWorker = Math.max(1, pixels * (colour ? 8 : 2));
        long byHeap = Math.max(1, Runtime.getRuntime().maxMemory() / 4 / perWorker);
        int cores = Runtime.getRuntime().availableProcessors();
        return (int) Math.max(1, Math.min(Math.min(cores, pages), byHeap));
    }

    private void apply(PDDocument document, PageResult result) throws IOException {
        PDPage page = document.getPage(result.index());
        if (result.rotate() != 0) {
            page.setRotation(Math.floorMod(page.getRotation() + result.rotate(), 360));
        }
        if (result.replacement() != null) {
            OcrPageImages.Encoded encoded = result.replacement();
            PDImageXObject image =
                    encoded.jpeg() != null
                            ? JPEGFactory.createFromByteArray(document, encoded.jpeg())
                            : CCITTFactory.createFromImage(document, encoded.bilevel());
            OcrTextLayer.replaceWithImage(document, page, image);
        }
        try (PDDocument textLayer = Loader.loadPDF(result.textLayer().toFile())) {
            PDFormXObject form = new LayerUtility(document).importPageAsForm(textLayer, 0);
            OcrTextLayer.graft(document, page, form);
        }
    }

    private static boolean pageHasText(PDFTextStripper stripper, PDDocument document, int pageIndex)
            throws IOException {
        stripper.setStartPage(pageIndex + 1);
        stripper.setEndPage(pageIndex + 1);
        return !stripper.getText(document).isBlank();
    }

    /** Thread-confined Tesseract instances: TessBaseAPI keeps per-page state between calls. */
    private static final class Worker implements AutoCloseable {

        private final String tessData;
        private final TessBaseAPI ocr = new TessBaseAPI();
        private final TessBaseAPI osd;
        private final L_KERNEL smoothing = kernelCreateFromString(3, 3, 1, 1, "1 2 1 2 4 2 1 2 1");

        Worker(String tessData, String language, boolean withOsd) throws IOException {
            this.tessData = tessData;
            if (ocr.Init(tessData, language) != 0) {
                ocr.close();
                throw new IOException("Tesseract could not load languages " + language);
            }
            // The API defaults to one uniform block; the CLI (and so OCRmyPDF) analyses layout.
            ocr.SetPageSegMode(tesseract.PSM_AUTO);
            TessBaseAPI orientation = null;
            if (withOsd) {
                orientation = new TessBaseAPI();
                if (orientation.Init(tessData, "osd") != 0) {
                    orientation.close();
                    orientation = null;
                    log.warn("Tesseract could not load osd.traineddata; pages are not rotated");
                } else {
                    orientation.SetPageSegMode(tesseract.PSM_OSD_ONLY);
                }
            }
            this.osd = orientation;
        }

        PageResult process(
                int index,
                RenderResult page,
                int dpi,
                boolean keepColour,
                OcrOptions options,
                Path workDir)
                throws IOException {
            PIX pix =
                    keepColour
                            ? OcrPageImages.rgbPix(page.rgba(), page.width(), page.height())
                            : OcrPageImages.grayPix(
                                    OcrPageImages.luma(page.rgba(), page.width(), page.height()),
                                    page.width(),
                                    page.height());
            if (pix == null) throw new IOException("Leptonica could not allocate page " + index);
            try {
                pixSetResolution(pix, dpi, dpi);
                int rotate = osd != null ? orientationCorrection(pix) : 0;
                if (rotate != 0) pix = replace(pix, pixRotateOrth(pix, rotate / 90));
                boolean straightened = false;
                if (options.deskew()) {
                    FloatPointer angle = new FloatPointer(1);
                    FloatPointer confidence = new FloatPointer(1);
                    PIX deskewed = pixFindSkewAndDeskew(pix, 2, angle, confidence);
                    // An unsure Leptonica returns a clone, and JavaCPP hands back the same Java
                    // object for the same address, so the clone's reference is released through a
                    // separate handle to keep pix itself valid.
                    if (deskewed != null && deskewed.address() == pix.address()) {
                        pixDestroy(new PIX(deskewed));
                    } else if (deskewed != null && Math.abs(angle.get()) >= MIN_DESKEW_DEGREES) {
                        pix = replace(pix, deskewed);
                        straightened = true;
                    } else if (deskewed != null) {
                        pixDestroy(deskewed);
                    }
                    log.debug(
                            "Page {} skew {} degrees (confidence {}), straightened: {}",
                            index + 1,
                            angle.get(),
                            confidence.get(),
                            straightened);
                }
                pixSetResolution(pix, dpi, dpi);
                OcrPageImages.Encoded replacement =
                        options.force() || straightened
                                ? OcrPageImages.encode(OcrPageImages.toImage(pix))
                                : null;
                Path base = workDir.resolve("page-" + index);
                PIX input = smoothed(pix, dpi);
                String text;
                try {
                    text = recognise(input, base);
                } finally {
                    if (input != pix) pixDestroy(input);
                }
                return new PageResult(index, Path.of(base + ".pdf"), text, replacement, rotate);
            } finally {
                pixDestroy(pix);
            }
        }

        /** Clockwise degrees that make the page upright, or 0 when OSD is unsure. */
        private int orientationCorrection(PIX pix) {
            osd.SetImage(pix);
            IntPointer degrees = new IntPointer(1);
            FloatPointer confidence = new FloatPointer(1);
            FloatPointer scriptConfidence = new FloatPointer(1);
            PointerPointer<BytePointer> script = new PointerPointer<>(1);
            if (!osd.DetectOrientationScript(degrees, confidence, script, scriptConfidence)
                    || confidence.get() < OSD_MIN_CONFIDENCE) {
                return 0;
            }
            // OSD reports the image's clockwise rotation; the correction turns it back.
            return Math.floorMod(360 - degrees.get(), 360);
        }

        private String recognise(PIX pix, Path base) throws IOException {
            try (TessPDFRenderer renderer = new TessPDFRenderer(base.toString(), tessData, true)) {
                if (!renderer.BeginDocument("OCR")
                        || !ocr.ProcessPage(pix, 0, "page", null, 0, renderer)
                        || !renderer.EndDocument()) {
                    throw new IOException("Tesseract failed on " + base.getFileName());
                }
            }
            BytePointer text = ocr.GetUTF8Text();
            try {
                return text == null ? "" : text.getString(StandardCharsets.UTF_8);
            } finally {
                if (text != null) tesseract.TessDeleteText(text);
            }
        }

        /** Greyscale, Gaussian-smoothed copy for Tesseract; falls back to {@code pix} itself. */
        private PIX smoothed(PIX pix, int dpi) {
            PIX gray = pixGetDepth(pix) == 32 ? pixConvertRGBToLuminance(pix) : null;
            PIX smooth = pixConvolve(gray != null ? gray : pix, smoothing, 8, 1);
            if (gray != null) pixDestroy(gray);
            if (smooth == null) return pix;
            pixSetResolution(smooth, dpi, dpi);
            return smooth;
        }

        private static PIX replace(PIX old, PIX replacement) {
            if (replacement == null) return old;
            pixDestroy(old);
            return replacement;
        }

        @Override
        public void close() {
            ocr.End();
            ocr.close();
            kernelDestroy(smoothing);
            if (osd != null) {
                osd.End();
                osd.close();
            }
        }
    }

    private boolean loadNatives() {
        try {
            long start = System.nanoTime();
            org.bytedeco.javacpp.Loader.load(tesseract.class);
            log.info(
                    "In-process Tesseract {} loaded in {} ms",
                    tesseract.TessVersion().getString(),
                    (System.nanoTime() - start) / 1_000_000);
            return true;
        } catch (Throwable e) {
            // Builds without natives for this platform throw UnsatisfiedLinkError here.
            log.info("In-process Tesseract unavailable: {}", e.toString());
            return false;
        }
    }

    private boolean hasLanguage() {
        File[] files = new File(runtimePathConfig.getTessDataPath()).listFiles();
        if (files == null) return false;
        for (File file : files) {
            String name = file.getName();
            if (name.endsWith(".traineddata") && !"osd.traineddata".equalsIgnoreCase(name)) {
                return true;
            }
        }
        log.info(
                "In-process Tesseract disabled: no languages in {}",
                runtimePathConfig.getTessDataPath());
        return false;
    }
}
