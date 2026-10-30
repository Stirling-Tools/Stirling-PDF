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

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

import javax.management.JMException;
import javax.management.ObjectName;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.CCITTFactory;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
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
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ExceptionUtils;
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
 * <p>Availability is decided without loading anything: this platform's natives must be packaged,
 * the tessdata folder must hold a language, and the admin must not have removed the {@code
 * tesseract} or {@value #GROUP} group. The natives load on first use, or right after startup when
 * OCRmyPDF is absent, so instances where OCRmyPDF does the work never load them. Concurrent jobs
 * share the tesseract CLI's session limit.
 */
@Slf4j
@Service
public class NativeTesseractService {

    public static final String GROUP = "TesseractNative";

    /** OCRmyPDF's default --rotate-pages-threshold. */
    static final float OSD_MIN_CONFIDENCE = 14f;

    /** OCRmyPDF's default --tesseract-timeout; a page that runs over is left without OCR. */
    static final int PAGE_TIMEOUT_MS = 180_000;

    /** Larger pages render at a lower DPI: an A0 sheet at 300 dpi is ~140 Mpx, 560 MB as RGBA. */
    static final long MAX_PAGE_PIXELS = 50_000_000L;

    /** Below this Leptonica's estimate is noise; straightening would only blur the page. */
    private static final float MIN_DESKEW_DEGREES = 0.1f;

    private static final String JAVACPP_CACHE_DIR = "org.bytedeco.javacpp.cachedir";

    private static final boolean WINDOWS =
            System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows");

    private final ApplicationProperties applicationProperties;
    private final RuntimePathConfig runtimePathConfig;
    private final EndpointConfiguration endpointConfiguration;
    private final Semaphore sessions;
    private final Object loadLock = new Object();
    private volatile boolean available;
    // null until the first load attempt, then whether it succeeded
    private volatile Boolean loaded;

    public NativeTesseractService(
            ApplicationProperties applicationProperties,
            RuntimePathConfig runtimePathConfig,
            EndpointConfiguration endpointConfiguration) {
        this.applicationProperties = applicationProperties;
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
        available = computeAvailability();
        if (!available) disableGroup();
    }

    /** Desktop users OCR locally from the start, so the first job should not pay for loading. */
    @EventListener(ApplicationReadyEvent.class)
    void warmUp() {
        if (available && !endpointConfiguration.isGroupEnabled("OCRmyPDF")) {
            Thread.ofVirtual().name("tesseract-native-load").start(this::loadOnce);
        }
    }

    /** True when OCR can run here; never blocks on loading the natives. */
    public boolean isAvailable() {
        return available;
    }

    /** Re-reads the tessdata folder, e.g. after a language was installed. */
    public synchronized void refreshAvailability() {
        boolean now = computeAvailability();
        if (now && !available) endpointConfiguration.enableGroup(GROUP);
        if (!now && available) disableGroup();
        available = now;
    }

    // With no language installed the engine still counts as available where one can be added,
    // because adding one goes through the OCR tool's own language picker.
    private boolean computeAvailability() {
        if (Boolean.FALSE.equals(loaded) || removedByConfig() || !nativesPackaged()) return false;
        String tessData = runtimePathConfig.getTessDataPath();
        if (OcrLanguages.installed(tessData).isEmpty() && !OcrLanguages.canInstall(tessData)) {
            log.info("In-process Tesseract disabled: no languages in {}", tessData);
            return false;
        }
        return true;
    }

    private void disableGroup() {
        endpointConfiguration.disableGroup(GROUP, EndpointConfiguration.DisableReason.DEPENDENCY);
    }

    /** Removing the tesseract group is how admins have always switched Tesseract OCR off. */
    private boolean removedByConfig() {
        ApplicationProperties.Endpoints endpoints = applicationProperties.getEndpoints();
        List<String> removed = endpoints == null ? null : endpoints.getGroupsToRemove();
        return removed != null
                && removed.stream()
                        .anyMatch(
                                g -> "tesseract".equalsIgnoreCase(g) || GROUP.equalsIgnoreCase(g));
    }

    /** Looks for this platform's JNI library on the classpath without loading it. */
    static boolean nativesPackaged() {
        String platform = javacppPlatform();
        if (platform == null) return false;
        String library =
                "org/bytedeco/tesseract/" + platform + "/" + System.mapLibraryName("jnitesseract");
        return NativeTesseractService.class.getClassLoader().getResource(library) != null;
    }

    /** JavaCPP's platform name, matching the classifiers chosen in app/common/build.gradle. */
    static String javacppPlatform() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String arch = System.getProperty("os.arch", "").toLowerCase(Locale.ROOT);
        String cpu =
                switch (arch) {
                    case "amd64", "x86_64" -> "x86_64";
                    case "aarch64", "arm64" -> "arm64";
                    default -> null;
                };
        if (cpu == null) return null;
        if (os.startsWith("windows")) return "windows-" + cpu;
        if (os.startsWith("mac")) return "macosx-" + cpu;
        if (os.startsWith("linux")) return "linux-" + cpu;
        return null;
    }

    private boolean loadOnce() {
        Boolean state = loaded;
        if (state != null) return state;
        synchronized (loadLock) {
            if (loaded == null) {
                loaded = loadNatives();
                if (!loaded) refreshAvailability();
            }
            return loaded;
        }
    }

    private void ensureLoaded() throws IOException {
        if (!loadOnce()) throw new IOException("The OCR engine could not start on this system");
    }

    /** Whether Tesseract can initialise {@code language} from {@code tessdataDir}. */
    public boolean canLoadLanguage(Path tessdataDir, String language) throws IOException {
        ensureLoaded();
        try (TessBaseAPI api = new TessBaseAPI()) {
            boolean ok = api.Init(nativePath(tessdataDir), language) == 0;
            api.End();
            return ok;
        }
    }

    /**
     * OCRs {@code document}, which must be loaded from {@code pdfFile}, in place and returns the
     * sidecar text, pages separated by form feeds. Pages that already have text are skipped unless
     * {@code options.force()}; a page Tesseract cannot finish within {@link #PAGE_TIMEOUT_MS} is
     * left as it was, as OCRmyPDF does.
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
                sidecar[i] = skipped(i);
            } else {
                ocrPages.add(i);
            }
        }

        if (!ocrPages.isEmpty()) {
            ensureLoaded();
            List<PageResult> results =
                    recognise(pdfFile, document, ocrPages, languages, options, dpi, workDir);
            for (PageResult result : results) {
                if (result.textLayer() == null) {
                    sidecar[result.index()] = skipped(result.index());
                    continue;
                }
                apply(document, result);
                sidecar[result.index()] = result.text();
            }
        }
        if (options.removeImages()) OcrOutputOptimizer.removeImages(document);
        long saved = OcrOutputOptimizer.deflateJpegs(document);
        if (saved > 0) log.debug("Re-wrapping JPEGs in Flate saved {} bytes", saved);
        return String.join("\f", sidecar);
    }

    private static String skipped(int index) {
        return "[OCR skipped on page " + (index + 1) + "]";
    }

    /** One OCRed page, ready for the PDFBox thread; a null text layer means it was left as is. */
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
        Map<Integer, Integer> pageDpis = new HashMap<>();
        long largest = 1;
        for (int index : pages) {
            PDPage page = document.getPage(index);
            int pageDpi = pageDpi(page, dpi);
            pageDpis.put(index, pageDpi);
            largest = Math.max(largest, pixels(page, pageDpi));
        }
        int workers = workerCount(pages.size(), largest, keepColour);
        String language = String.join("+", languages);
        String nativeTessData = nativePath(Path.of(tessData));
        long timeoutMinutes =
                applicationProperties
                        .getProcessExecutor()
                        .getTimeoutMinutes()
                        .getTesseractTimeoutMinutes();

        sessions.acquire();
        // Time spent queued behind other jobs does not count against this one.
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(timeoutMinutes);
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
        try (PdfDocument pdf = PdfDocument.open(pdfFile)) {
            Renderer renderer = renderer(pdf, document);
            List<Future<PageResult>> futures = new ArrayList<>();
            for (int index : pages) {
                int pageDpi = pageDpis.get(index);
                futures.add(
                        pool.submit(
                                () -> {
                                    Worker worker = local.get();
                                    if (worker == null) {
                                        worker = new Worker(nativeTessData, language, osd);
                                        started.add(worker);
                                        local.set(worker);
                                    }
                                    PIX pix = renderer.render(index, pageDpi, keepColour);
                                    return worker.process(index, pix, pageDpi, options, workDir);
                                }));
            }
            List<PageResult> results = new ArrayList<>(futures.size());
            for (Future<PageResult> future : futures) {
                try {
                    long remaining = Math.max(0, deadline - System.nanoTime());
                    results.add(future.get(remaining, TimeUnit.NANOSECONDS));
                } catch (TimeoutException e) {
                    futures.forEach(f -> f.cancel(true));
                    throw new IOException(
                            "OCR did not finish within " + timeoutMinutes + " minutes", e);
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
            try {
                pool.shutdownNow();
                // A native call ignores interrupts but is bounded by PAGE_TIMEOUT_MS. Closing a
                // Tesseract instance a worker is still using would crash the JVM, so if one is
                // still running its instances are left allocated instead.
                if (pool.awaitTermination(PAGE_TIMEOUT_MS + 60_000L, TimeUnit.MILLISECONDS)) {
                    started.forEach(Worker::close);
                } else {
                    log.error("OCR workers outlived the page timeout; their memory is not freed");
                }
            } finally {
                sessions.release();
            }
        }
    }

    /** Renders one page straight into a Leptonica image. Callers must hold no other locks. */
    @FunctionalInterface
    private interface Renderer {
        PIX render(int index, int dpi, boolean colour) throws IOException;
    }

    /**
     * pdfium renders from the file while pages are counted and changed on the PDFBox document; if
     * the two parsers disagree about the page tree (a damaged file one of them repaired), PDFBox
     * renders instead so every text layer lands on the page it came from. Either way one page is
     * rendered at a time and converted before the lock is released, so a single RGBA buffer is
     * alive at once.
     */
    private Renderer renderer(PdfDocument pdf, PDDocument document) {
        ReentrantLock lock = new ReentrantLock();
        if (pdf.pageCount() != document.getNumberOfPages()) {
            log.warn(
                    "pdfium sees {} pages but PDFBox sees {}; rendering with PDFBox",
                    pdf.pageCount(),
                    document.getNumberOfPages());
            PDFRenderer pdfBox = new PDFRenderer(document);
            return (index, dpi, colour) ->
                    locked(
                            lock,
                            index,
                            dpi,
                            () ->
                                    OcrPageImages.fromImage(
                                            pdfBox.renderImageWithDPI(
                                                    index,
                                                    dpi,
                                                    colour ? ImageType.RGB : ImageType.GRAY)));
        }
        return (index, dpi, colour) ->
                locked(
                        lock,
                        index,
                        dpi,
                        () -> {
                            try (PdfPage page = pdf.page(index)) {
                                RenderResult r = page.renderAt(dpi);
                                return colour
                                        ? OcrPageImages.rgbPix(r.rgba(), r.width(), r.height())
                                        : OcrPageImages.grayPix(
                                                OcrPageImages.luma(r.rgba(), r.width(), r.height()),
                                                r.width(),
                                                r.height());
                            }
                        });
    }

    private static PIX locked(
            ReentrantLock lock, int index, int dpi, ExceptionUtils.RenderOperation<PIX> render)
            throws IOException {
        lock.lock();
        try {
            PIX pix = ExceptionUtils.handleOomRendering(index + 1, dpi, render);
            if (pix == null) throw new IOException("Could not allocate page " + (index + 1));
            return pix;
        } finally {
            lock.unlock();
        }
    }

    /** The requested DPI, lowered just enough to keep the page under {@link #MAX_PAGE_PIXELS}. */
    static int pageDpi(PDPage page, int dpi) {
        double pixels = pixels(page, dpi);
        if (pixels <= MAX_PAGE_PIXELS) return dpi;
        return Math.max(1, (int) Math.floor(dpi * Math.sqrt(MAX_PAGE_PIXELS / pixels)));
    }

    private static long pixels(PDPage page, int dpi) {
        PDRectangle box = page.getCropBox();
        return (long) (box.getWidth() / 72 * dpi) * (long) (box.getHeight() / 72 * dpi);
    }

    /**
     * One worker per core, as OCRmyPDF's --jobs defaults to, but no more pages in flight than fit
     * in half the memory outside the heap, where Leptonica and Tesseract allocate, or in half the
     * heap, where replacement pages are encoded. Total memory is the container's limit when there
     * is one.
     */
    static int workerCount(int pages, long pagePixels, boolean colour) {
        long heap = Runtime.getRuntime().maxMemory();
        return workerCount(
                pages,
                pagePixels,
                colour,
                heap,
                totalMemory(heap),
                Runtime.getRuntime().availableProcessors());
    }

    static int workerCount(
            int pages, long pagePixels, boolean colour, long heap, long total, int cores) {
        long perWorker = Math.max(1, pagePixels * (colour ? 12L : 8L));
        long budget = Math.min(heap, Math.max(0, total - heap)) / 2;
        long byMemory = Math.max(1, budget / perWorker);
        return (int) Math.max(1, Math.min(Math.min(cores, pages), byMemory));
    }

    /** Twice the heap when the runtime cannot say, which leaves the heap as the only limit. */
    private static long totalMemory(long heap) {
        try {
            Object size =
                    ManagementFactory.getPlatformMBeanServer()
                            .getAttribute(
                                    new ObjectName(ManagementFactory.OPERATING_SYSTEM_MXBEAN_NAME),
                                    "TotalMemorySize");
            if (size instanceof Long bytes && bytes > 0) return bytes;
        } catch (JMException | RuntimeException e) {
            // The attribute comes from jdk.management, which the desktop's runtime leaves out.
        }
        return 2 * heap;
    }

    /**
     * How to name {@code path} to Tesseract and Leptonica, which open files with fopen. On Windows
     * that reads the bytes in the ANSI code page, so a folder under a non-ASCII user name cannot be
     * opened by its absolute path; relative to the working directory, which on desktop is in the
     * same profile, it can.
     */
    static String nativePath(Path path) {
        return nativePath(path, Path.of("").toAbsolutePath(), WINDOWS);
    }

    static String nativePath(Path path, Path workingDir, boolean windows) {
        Path absolute = path.toAbsolutePath().normalize();
        if (!windows || isAscii(absolute.toString())) return absolute.toString();
        try {
            String relative =
                    workingDir.toAbsolutePath().normalize().relativize(absolute).toString();
            if (isAscii(relative)) return relative.isEmpty() ? "." : relative;
        } catch (IllegalArgumentException e) {
            // A path on another drive has no relative form.
        }
        log.warn("Tesseract cannot open {} on Windows: the path is not ASCII", absolute);
        return absolute.toString();
    }

    private static boolean isAscii(String text) {
        return text.chars().allMatch(c -> c < 128);
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
        private TessBaseAPI osd;
        private L_KERNEL smoothing;

        Worker(String tessData, String language, boolean withOsd) throws IOException {
            this.tessData = tessData;
            if (ocr.Init(tessData, language) != 0) {
                ocr.close();
                throw new IOException("Tesseract could not load languages " + language);
            }
            // The API defaults to one uniform block; the CLI (and so OCRmyPDF) analyses layout.
            ocr.SetPageSegMode(tesseract.PSM_AUTO);
            smoothing = kernelCreateFromString(3, 3, 1, 1, "1 2 1 2 4 2 1 2 1");
            if (withOsd) {
                TessBaseAPI orientation = new TessBaseAPI();
                if (orientation.Init(tessData, "osd") != 0) {
                    orientation.close();
                    log.warn("Tesseract could not load osd.traineddata; pages are not rotated");
                } else {
                    orientation.SetPageSegMode(tesseract.PSM_OSD_ONLY);
                    osd = orientation;
                }
            }
        }

        /** Takes ownership of {@code pix}. */
        PageResult process(int index, PIX pix, int dpi, OcrOptions options, Path workDir)
                throws IOException {
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
                Path base = workDir.resolve("page-" + index);
                PIX input = smoothed(pix, dpi);
                String text;
                try {
                    text = recognise(input, base);
                } finally {
                    if (input != pix) pixDestroy(input);
                }
                if (text == null) {
                    log.warn(
                            "Page {} not OCRed: Tesseract failed or ran past {} s",
                            index + 1,
                            PAGE_TIMEOUT_MS / 1000);
                    return new PageResult(index, null, null, null, 0);
                }
                OcrPageImages.Encoded replacement =
                        options.force() || straightened
                                ? OcrPageImages.encode(OcrPageImages.toImage(pix))
                                : null;
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

        /** The page's plain text, or null when Tesseract failed or hit the page timeout. */
        private String recognise(PIX pix, Path base) {
            try (TessPDFRenderer renderer = new TessPDFRenderer(nativePath(base), tessData, true)) {
                if (!renderer.BeginDocument("OCR")
                        || !ocr.ProcessPage(pix, 0, "page", null, PAGE_TIMEOUT_MS, renderer)
                        || !renderer.EndDocument()) {
                    return null;
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
            if (smoothing != null) kernelDestroy(smoothing);
            if (osd != null) {
                osd.End();
                osd.close();
            }
        }
    }

    /**
     * JavaCPP unpacks the natives into ~/.javacpp/cache unless told otherwise. The desktop app
     * keeps them with its own data, and a home folder that cannot be written falls back to temp.
     */
    private static void chooseNativeCache() {
        if (System.getProperty(JAVACPP_CACHE_DIR) != null) return;
        Path dir;
        if (OcrLanguages.desktopApp()) {
            dir = Path.of(InstallationPathConfig.getPath(), "cache", "javacpp");
        } else if (Files.isWritable(Path.of(System.getProperty("user.home", "")))) {
            return;
        } else {
            dir = Path.of(System.getProperty("java.io.tmpdir"), "stirling-pdf-javacpp");
        }
        System.setProperty(JAVACPP_CACHE_DIR, dir.toAbsolutePath().normalize().toString());
    }

    private boolean loadNatives() {
        try {
            long start = System.nanoTime();
            chooseNativeCache();
            org.bytedeco.javacpp.Loader.load(tesseract.class);
            log.info(
                    "In-process Tesseract {} loaded in {} ms",
                    tesseract.TessVersion().getString(),
                    (System.nanoTime() - start) / 1_000_000);
            return true;
        } catch (Throwable e) {
            // A packaged library can still fail to link, e.g. a blocked unsigned macOS dylib.
            log.warn("In-process Tesseract could not load: {}", e.toString());
            return false;
        }
    }
}
