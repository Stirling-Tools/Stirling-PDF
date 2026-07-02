package stirling.software.common.util;

import java.io.IOException;
import java.util.concurrent.Semaphore;

import lombok.extern.slf4j.Slf4j;

/**
 * Process-wide semaphore that bounds the number of concurrent PDFBox page rasterizations.
 *
 * <p>Each {@code renderer.renderImageWithDPI(...)} call allocates a {@link
 * java.awt.image.BufferedImage} sized to the page. At 300 DPI a US-Letter page in {@code
 * TYPE_INT_RGB} is ~34 MiB, plus per-page transforms (color-space conversion, border, rotation)
 * tend to clone the image 1-2× during processing. Several controllers ({@code
 * ScannerEffectController}, {@code AutoSplitPdfController}, …) dispatch these renders into a custom
 * {@link java.util.concurrent.ForkJoinPool} sized by processor count — on the 24-core production
 * host that meant up to 24 simultaneous in-flight rasters, exhausting the JVM heap on a 2 GiB pod
 * before {@link CustomPDFDocumentFactory}'s gate noticed.
 *
 * <p>{@code RenderGate} is the missing global cap. It is sized at class-load time from {@link
 * Runtime#maxMemory()} using the same heap-as-source-of-truth strategy the audit (2026-05-29)
 * recommended:
 *
 * <pre>
 *     concurrentRenders = clamp(2, min(processors, 16), heapBudget / estimatedPageBytes)
 *     heapBudget         = maxHeap / 4   (give 25% of heap to concurrent rasters)
 *     estimatedPageBytes = 50 MiB        (300 DPI Letter RGB + headroom for transforms)
 * </pre>
 *
 * For a 1.3-1.5 GiB heap that resolves to ~6 concurrent renders (~300 MiB worst-case raster memory)
 * instead of 24 (~1.6 GiB). The chosen value is logged on startup.
 *
 * <p>Use via the static {@link #acquireAnd(Callable)} helper at every {@code renderImageWithDPI}
 * call-site. Acquires uninterruptibly so callers don't need to handle {@link InterruptedException}
 * in render code — the actual render call below is the cancellation point.
 */
@Slf4j
public final class RenderGate {

    /** Reserve roughly 25% of heap for concurrent page rasters. */
    private static final long HEAP_FRACTION_FOR_RASTERS = 4L;

    /** A 300 DPI US-Letter page in TYPE_INT_RGB is ~34 MiB; budget 50 MiB to cover transforms. */
    private static final long ESTIMATED_PAGE_BYTES = 50L * 1024 * 1024;

    /** Absolute upper bound regardless of available cores or heap. */
    private static final int MAX_RENDERS_CEILING = 16;

    /**
     * Lower bound: always allow at least 2 concurrent renders so single-threaded users see no gate.
     */
    private static final int MAX_RENDERS_FLOOR = 2;

    public static final int MAX_CONCURRENT_RENDERS;

    private static final Semaphore GATE;

    static {
        long maxHeapBytes = Math.min(Runtime.getRuntime().maxMemory(), 32L * 1024 * 1024 * 1024);
        long heapBudget = maxHeapBytes / HEAP_FRACTION_FOR_RASTERS;
        int byHeap = (int) Math.max(1, heapBudget / ESTIMATED_PAGE_BYTES);
        int byCpu = Runtime.getRuntime().availableProcessors();

        MAX_CONCURRENT_RENDERS =
                Math.max(MAX_RENDERS_FLOOR, Math.min(MAX_RENDERS_CEILING, Math.min(byHeap, byCpu)));
        GATE = new Semaphore(MAX_CONCURRENT_RENDERS);

        log.info(
                "RenderGate: heap={} MiB, MAX_CONCURRENT_RENDERS={} (byHeap={}, byCpu={})",
                maxHeapBytes / (1024 * 1024),
                MAX_CONCURRENT_RENDERS,
                byHeap,
                byCpu);
    }

    /**
     * Runs {@code render} inside a single semaphore permit. Blocks (uninterruptibly) until a slot
     * is free, runs the render, then releases the slot — even if the render throws.
     *
     * <p>Uses {@link ExceptionUtils.RenderOperation} so the signature matches {@link
     * ExceptionUtils#handleOomRendering} exactly: typical call-site is
     *
     * <pre>
     *     image = RenderGate.acquireAnd(
     *             () -&gt; ExceptionUtils.handleOomRendering(
     *                     pageNumber, dpi,
     *                     () -&gt; renderer.renderImageWithDPI(pageIndex, dpi)));
     * </pre>
     *
     * @param render the rendering operation, typically a {@code
     *     pdfRenderer.renderImageWithDPI(...)} call wrapped in {@link
     *     ExceptionUtils#handleOomRendering}.
     */
    public static <T> T acquireAnd(ExceptionUtils.RenderOperation<T> render) throws IOException {
        GATE.acquireUninterruptibly();
        try {
            return render.render();
        } finally {
            GATE.release();
        }
    }

    private RenderGate() {}
}
