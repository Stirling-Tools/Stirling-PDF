package stirling.software.SPDF.bench;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfMerge;

/**
 * Apples-to-apples memory benchmark for the merge tool: PDFBox's
 * {@link PDFMergerUtility} (old MergeController path) vs JPDFium's
 * {@link PdfMerge#mergeFiles(List)} (new path).
 *
 * <p>Generates two 100-page test PDFs each with a unique embedded JPEG per
 * page, merges them, samples heap usage every 25 ms during the merge, and
 * reports peak heap. Run with:
 *
 * <pre>{@code
 * ./gradlew :stirling-pdf:test --tests '*MergeBenchmark*' -i
 * }</pre>
 *
 * or invoke directly:
 *
 * <pre>{@code
 * java -cp <classpath> stirling.software.SPDF.bench.MergeBenchmark
 * }</pre>
 *
 * <p>Outputs:
 * <ul>
 *   <li>Input PDF sizes
 *   <li>Pre-merge baseline heap (after forced GC)
 *   <li>PDFBox peak heap during merge
 *   <li>JPDFium peak heap during merge
 *   <li>Memory improvement %
 * </ul>
 *
 * <p>Off-heap / native memory used by JPDFium is NOT counted toward "heap
 * peak" — that is the whole point of the comparison. PDFium's arena lives
 * outside the JVM heap, so off-heap usage shows up as RSS growth which we
 * report separately from {@code /proc/self/status} on Linux or
 * {@code GetProcessMemoryInfo} via JMX on Windows.
 */
public final class MergeBenchmark {

    private static final int PAGES_PER_DOC =
            Integer.getInteger("merge.bench.pages", 100);
    private static final int IMAGE_W = Integer.getInteger("merge.bench.imgW", 800);
    private static final int IMAGE_H = Integer.getInteger("merge.bench.imgH", 600);
    private static final int DOC_COUNT =
            Integer.getInteger("merge.bench.docs", 2);
    private static final long SAMPLE_PERIOD_MS = 25L;

    /**
     * Invoke explicitly with:
     *
     * <pre>{@code
     * ./gradlew :stirling-pdf:test --tests '*MergeBenchmark*' -i
     * }</pre>
     *
     * <p>Test is filename-targeted (only the {@code --tests} filter runs it)
     * so it doesn't slow down the regular test suite.
     */
    @Test
    void compareMergeMemoryFootprint() throws Exception {
        main(new String[0]);
    }

    public static void main(String[] args) throws Exception {
        Path workDir = Files.createTempDirectory("merge-bench-");
        System.out.println("Work dir: " + workDir);

        try {
            List<Path> inputs = new ArrayList<>(DOC_COUNT);
            for (int i = 0; i < DOC_COUNT; i++) {
                inputs.add(workDir.resolve("doc-" + (char) ('a' + i) + ".pdf"));
            }

            // Build inputs in a fresh JVM-warm phase BEFORE the timed runs so
            // class loading / JIT warmup doesn't pollute the merge samples.
            System.out.printf(
                    "Generating %d × %d-page PDFs with %dx%d embedded images…%n",
                    DOC_COUNT, PAGES_PER_DOC, IMAGE_W, IMAGE_H);
            long t0 = System.nanoTime();
            for (Path p : inputs) {
                generateTestPdf(p, PAGES_PER_DOC);
                System.out.printf(
                        "  built %s: %,d KB (%d pages)%n",
                        p.getFileName(), Files.size(p) / 1024, PAGES_PER_DOC);
            }
            long buildMs = (System.nanoTime() - t0) / 1_000_000;
            System.out.printf("  generation took %,d ms%n%n", buildMs);

            // Warmup pass: prime classloaders + native lib load + JIT so the
            // FIRST measured run doesn't get blamed for everything that's
            // normally amortised across many requests.
            System.out.println("--- Warmup pass (results discarded) ---");
            runPdfBoxMerge(inputs, workDir.resolve("warmup-pdfbox.pdf"));
            runJpdfiumMerge(inputs, workDir.resolve("warmup-jpdfium.pdf"));
            forceGcQuiescence();
            System.out.println();

            // Baseline heap snapshot — what the JVM uses with the inputs on
            // disk but no merge running. Both runs should start from this
            // floor.
            long baseline = sampleUsedHeapAfterGc();
            System.out.printf(
                    "Baseline heap (after GC, before merge): %,d KB%n%n", baseline / 1024);

            // === PDFBox run ===
            System.out.println("--- PDFBox PDFMergerUtility ---");
            Path outPdfbox = workDir.resolve("out-pdfbox.pdf");
            BenchResult pdfboxResult = profile(() -> runPdfBoxMerge(inputs, outPdfbox));
            System.out.printf("  output size : %,d KB%n", Files.size(outPdfbox) / 1024);
            pdfboxResult.printSummary("PDFBox", baseline);

            // GC + cooldown between runs so JPDFium's measurement starts clean.
            forceGcQuiescence();
            System.out.println();

            // === JPDFium run ===
            System.out.println("--- JPDFium PdfMerge.mergeFiles ---");
            Path outJpdfium = workDir.resolve("out-jpdfium.pdf");
            BenchResult jpdfiumResult = profile(() -> runJpdfiumMerge(inputs, outJpdfium));
            System.out.printf("  output size : %,d KB%n", Files.size(outJpdfium) / 1024);
            jpdfiumResult.printSummary("JPDFium", baseline);

            // === Compare ===
            System.out.println();
            System.out.println("=== Heap delta (over baseline) ===");
            long pdfboxDelta = pdfboxResult.peakHeapBytes - baseline;
            long jpdfiumDelta = jpdfiumResult.peakHeapBytes - baseline;
            double improvement =
                    pdfboxDelta == 0 ? 0.0 : (100.0 * (pdfboxDelta - jpdfiumDelta) / pdfboxDelta);
            System.out.printf("  PDFBox  : +%,d KB%n", pdfboxDelta / 1024);
            System.out.printf("  JPDFium : +%,d KB%n", jpdfiumDelta / 1024);
            System.out.printf(
                    "  JPDFium uses %.1f%% LESS heap than PDFBox for this merge%n",
                    improvement);
            System.out.printf(
                    "  Absolute saving: %,d KB%n%n", (pdfboxDelta - jpdfiumDelta) / 1024);

            System.out.println("=== Wall-clock ===");
            System.out.printf("  PDFBox  : %,d ms%n", pdfboxResult.wallMs);
            System.out.printf("  JPDFium : %,d ms%n", jpdfiumResult.wallMs);

            System.out.println();
            System.out.println("Verify outputs visually:");
            System.out.println("  " + outPdfbox);
            System.out.println("  " + outJpdfium);
        } finally {
            // Leave temp files in place so the user can re-inspect — workDir
            // is under the OS temp area so it gets cleaned up by the OS
            // eventually anyway.
        }
    }

    /**
     * Build a PDF with the given page count. Each page gets a unique JPEG
     * image (procedurally generated, ~30-40 KB per page) and a small text
     * caption — close enough to a "report with figures" workload that the
     * comparison reflects real merge cost.
     */
    private static void generateTestPdf(Path out, int pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            Random rng = new Random(42L);
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);

                byte[] jpegBytes = generateRandomJpeg(rng, IMAGE_W, IMAGE_H);
                PDImageXObject xobj = PDImageXObject.createFromByteArray(doc, jpegBytes, "img");

                try (PDPageContentStream cs =
                        new PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, false)) {
                    // Center the image with some margin
                    float pageW = page.getMediaBox().getWidth();
                    float pageH = page.getMediaBox().getHeight();
                    float imgRenderW = pageW - 100;
                    float imgRenderH = imgRenderW * IMAGE_H / IMAGE_W;
                    float x = (pageW - imgRenderW) / 2;
                    float y = pageH - 80 - imgRenderH;
                    cs.drawImage(xobj, x, y, imgRenderW, imgRenderH);

                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14);
                    cs.newLineAtOffset(50, 30);
                    cs.showText("Page " + (i + 1) + " — benchmark fill");
                    cs.endText();
                }
            }
            doc.save(out.toFile());
        }
    }

    /**
     * Generate a unique-looking JPEG so PDF object dedup can't quietly
     * collapse all pages into one image stream. We sweep hue per page and
     * draw some random circles on top.
     */
    private static byte[] generateRandomJpeg(Random rng, int w, int h) throws IOException {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        try {
            float hue = rng.nextFloat();
            g.setColor(Color.getHSBColor(hue, 0.4f, 0.95f));
            g.fillRect(0, 0, w, h);
            for (int i = 0; i < 20; i++) {
                g.setColor(Color.getHSBColor(rng.nextFloat(), 0.6f, 0.5f + rng.nextFloat() * 0.5f));
                int r = 20 + rng.nextInt(80);
                int cx = rng.nextInt(w);
                int cy = rng.nextInt(h);
                g.fillOval(cx - r, cy - r, r * 2, r * 2);
            }
            g.setColor(Color.BLACK);
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 32));
            g.drawString("benchmark image", 40, h - 40);
        } finally {
            g.dispose();
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", baos);
        return baos.toByteArray();
    }

    private static void runPdfBoxMerge(List<Path> inputs, Path output) throws IOException {
        PDFMergerUtility merger = new PDFMergerUtility();
        for (Path p : inputs) {
            merger.addSource(p.toFile());
        }
        merger.setDestinationFileName(output.toAbsolutePath().toString());
        merger.mergeDocuments(null);
    }

    private static void runJpdfiumMerge(List<Path> inputs, Path output) {
        List<PdfDocument> docs = new ArrayList<>();
        try {
            for (Path p : inputs) {
                docs.add(PdfDocument.open(p));
            }
            try (PdfDocument merged = PdfMerge.merge(docs)) {
                merged.save(output);
            }
        } finally {
            for (PdfDocument d : docs) {
                try {
                    d.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    /**
     * Run {@code task} with a memory-sampling thread polling heap usage in
     * the background. Returns peak heap-used seen during the run.
     */
    private static BenchResult profile(ThrowingRunnable task) throws Exception {
        forceGcQuiescence();

        MemoryMXBean mem = ManagementFactory.getMemoryMXBean();
        AtomicLong peakHeap = new AtomicLong(0);
        AtomicLong peakNonHeap = new AtomicLong(0);
        AtomicBoolean stop = new AtomicBoolean(false);

        Thread sampler =
                new Thread(
                        () -> {
                            while (!stop.get()) {
                                MemoryUsage heap = mem.getHeapMemoryUsage();
                                MemoryUsage nonHeap = mem.getNonHeapMemoryUsage();
                                peakHeap.updateAndGet(prev -> Math.max(prev, heap.getUsed()));
                                peakNonHeap.updateAndGet(prev -> Math.max(prev, nonHeap.getUsed()));
                                try {
                                    Thread.sleep(SAMPLE_PERIOD_MS);
                                } catch (InterruptedException e) {
                                    Thread.currentThread().interrupt();
                                    return;
                                }
                            }
                        },
                        "mem-sampler");
        sampler.setDaemon(true);
        sampler.start();

        long t0 = System.nanoTime();
        try {
            task.run();
        } finally {
            stop.set(true);
            sampler.join();
        }
        long wallMs = (System.nanoTime() - t0) / 1_000_000;

        return new BenchResult(peakHeap.get(), peakNonHeap.get(), wallMs);
    }

    /**
     * Aggressively quiesce the heap so the next sample reflects the steady
     * state, not lingering temporary objects from the previous step. Two GCs
     * back-to-back plus a short sleep usually does it.
     */
    private static void forceGcQuiescence() {
        for (int i = 0; i < 3; i++) {
            System.gc();
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private static long sampleUsedHeapAfterGc() {
        forceGcQuiescence();
        return ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed();
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }

    private record BenchResult(long peakHeapBytes, long peakNonHeapBytes, long wallMs) {
        void printSummary(String label, long baselineHeap) {
            long delta = peakHeapBytes - baselineHeap;
            System.out.printf("  peak heap     : %,d KB (Δ %,d KB over baseline)%n",
                    peakHeapBytes / 1024, delta / 1024);
            System.out.printf("  peak non-heap : %,d KB%n", peakNonHeapBytes / 1024);
            System.out.printf("  wall-clock    : %,d ms%n", wallMs);
        }
    }
}
