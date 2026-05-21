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

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriter;
import javax.imageio.ImageWriteParam;
import javax.imageio.stream.MemoryCacheImageOutputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfMerge;
import stirling.software.jpdfium.doc.PdfBookmarkEditor;
import stirling.software.jpdfium.doc.PdfBookmarkEditor.BookmarkTree;

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
    // Inject this many internal bookmarks per generated input PDF. The
    // merged document should contain (DOC_COUNT × INTERNAL_BOOKMARKS)
    // entries from sources, plus DOC_COUNT chapter headers added by the
    // TOC step. Lets us validate that source bookmarks are preserved
    // through the merge.
    private static final int INTERNAL_BOOKMARKS =
            Integer.getInteger("merge.bench.internalBookmarks", 0);
    // 0.0..1.0 JPEG quality. Default 0.6 keeps benchmarks small;
    // bump to 0.95+ with larger image dimensions to push input PDFs into
    // the hundreds-of-MB range.
    private static final float JPEG_QUALITY =
            Float.parseFloat(System.getProperty("merge.bench.jpegQ", "0.6"));
    private static final boolean WITH_TOC =
            Boolean.parseBoolean(System.getProperty("merge.bench.toc", "false"));
    private static final boolean WITH_SIG_REMOVAL =
            Boolean.parseBoolean(System.getProperty("merge.bench.sigRemoval", "false"));
    /**
     * When true, the JPDFium engine writes TOC via {@link
     * PdfBookmarkEditor#setBookmarks(PdfDocument, BookmarkTree, java.nio.file.Path)}
     * (streaming, KB-scale heap) instead of doing a PDFBox load+save post-pass.
     * Enables comparing the two TOC strategies in the same benchmark run.
     */
    private static boolean withJpdfiumToc =
            Boolean.parseBoolean(System.getProperty("merge.bench.jpdfiumToc", "false"));
    // Run each scenario this many times back-to-back, report median heap
    // and wall-clock. Cuts noise from GC scheduling + disk cache cold-start
    // on the first iteration. Median is ~immune to a single warm-up outlier.
    private static final int ITERATIONS =
            Math.max(1, Integer.getInteger("merge.bench.iterations", 1));
    private static final long SAMPLE_PERIOD_MS = 25L;

    // Mutable scenario flags so compareAllMergeScenarios() can run the same
    // benchmark loop three times without re-generating the 1+ GB of input
    // PDFs. The static initialisers above set the defaults from system
    // properties; the all-scenarios test toggles these per iteration.
    private static boolean withToc = WITH_TOC;
    private static boolean withSigRemoval = WITH_SIG_REMOVAL;

    /**
     * Invoke explicitly with:
     *
     * <pre>{@code
     * ./gradlew :stirling-pdf:test --tests '*MergeBenchmark*' \
     *     -Dmerge.bench=true -Dmerge.bench.docs=4 -Dmerge.bench.pages=70
     * }</pre>
     *
     * <p>Gated behind {@code -Dmerge.bench=true} so it stays out of normal
     * CI runs — generating the 1+ GB of input PDFs takes ~60 s and the
     * merges burn another ~30 s, neither of which belongs in regular
     * test cycles.
     */
    @Test
    @EnabledIfSystemProperty(named = "merge.bench", matches = "true")
    void compareMergeMemoryFootprint() throws Exception {
        main(new String[0]);
    }

    /**
     * Runs three back-to-back scenarios on a single shared set of inputs:
     *
     * <ol>
     *   <li>plain merge (no TOC, no sig removal)
     *   <li>merge + TOC generation
     *   <li>merge + signature removal
     * </ol>
     *
     * <p>Saves ~10 minutes of wall-clock vs running three separate test
     * invocations because the 1+ GB of input PDFs only gets generated once.
     * Gated behind {@code -Dmerge.bench=true} like the other benchmark.
     */
    @Test
    @EnabledIfSystemProperty(named = "merge.bench", matches = "true")
    void compareAllMergeScenarios() throws Exception {
        Path workDir = Files.createTempDirectory("merge-bench-all-");
        System.out.println("Work dir: " + workDir);

        try {
            List<Path> inputs = new ArrayList<>(DOC_COUNT);
            for (int i = 0; i < DOC_COUNT; i++) {
                inputs.add(workDir.resolve("doc-" + (char) ('a' + i) + ".pdf"));
            }
            System.out.printf(
                    "Generating %d × %d-page PDFs (%dx%d @ q=%.2f)…%n",
                    DOC_COUNT, PAGES_PER_DOC, IMAGE_W, IMAGE_H, JPEG_QUALITY);
            long t0 = System.nanoTime();
            for (Path p : inputs) {
                generateTestPdf(p, PAGES_PER_DOC);
                System.out.printf(
                        "  built %s: %,d KB (%d pages)%n",
                        p.getFileName(), Files.size(p) / 1024, PAGES_PER_DOC);
            }
            System.out.printf(
                    "  generation took %,d ms (total input size %,d KB)%n%n",
                    (System.nanoTime() - t0) / 1_000_000,
                    inputs.stream().mapToLong(p -> {
                        try {
                            return Files.size(p);
                        } catch (IOException e) {
                            return 0L;
                        }
                    }).sum() / 1024);

            // One small warmup pass against a single doc — enough to JIT the
            // hot merge code paths without paying the full benchmark cost.
            System.out.println("--- Warmup pass (1 input, results discarded) ---");
            withToc = false;
            withSigRemoval = false;
            runPdfBoxMerge(List.of(inputs.getFirst()), workDir.resolve("warmup-pdfbox.pdf"));
            runJpdfiumMerge(List.of(inputs.getFirst()), workDir.resolve("warmup-jpdfium.pdf"));
            forceGcQuiescence();
            System.out.println();

            List<ScenarioRow> rows = new ArrayList<>();
            rows.add(runScenario("plain", inputs, workDir, false, false));
            rows.add(runScenario("withToc", inputs, workDir, true, false));
            rows.add(runScenario("withSigRemoval", inputs, workDir, false, true));

            // Final summary table.
            System.out.println();
            System.out.println("================================ Summary ================================");
            System.out.printf(
                    "%-18s | %-22s | %-22s | %-12s%n",
                    "Scenario", "PDFBox peak heap Δ", "JPDFium peak heap Δ", "Reduction");
            System.out.println(
                    "-------------------+------------------------+------------------------+------------");
            for (ScenarioRow r : rows) {
                double improvement =
                        r.pdfboxDelta == 0
                                ? 0.0
                                : 100.0 * (r.pdfboxDelta - r.jpdfiumDelta) / r.pdfboxDelta;
                System.out.printf(
                        "%-18s | %,17d KB    | %,17d KB    | %6.1f%%%n",
                        r.name,
                        r.pdfboxDelta / 1024,
                        r.jpdfiumDelta / 1024,
                        improvement);
            }
            System.out.println(
                    "-------------------+------------------------+------------------------+------------");
            System.out.printf(
                    "%-18s | %-22s | %-22s | %-12s%n",
                    "Wall-clock", "PDFBox ms", "JPDFium ms", "Speedup");
            System.out.println(
                    "-------------------+------------------------+------------------------+------------");
            for (ScenarioRow r : rows) {
                double speedup = r.pdfboxMs == 0 ? 1.0 : (double) r.pdfboxMs / r.jpdfiumMs;
                System.out.printf(
                        "%-18s | %,17d ms    | %,17d ms    | %5.2fx%n",
                        r.name, r.pdfboxMs, r.jpdfiumMs, speedup);
            }
            System.out.println();
        } finally {
            // Leave inputs/outputs on disk for inspection.
        }
    }

    /**
     * Run one scenario (defined by the two flags) on a shared set of inputs.
     */
    private static ScenarioRow runScenario(
            String name,
            List<Path> inputs,
            Path workDir,
            boolean toc,
            boolean sig)
            throws Exception {
        withToc = toc;
        withSigRemoval = sig;
        forceGcQuiescence();
        long baseline = sampleUsedHeapAfterGc();
        System.out.printf("--- Scenario: %s (TOC=%s, removeCertSign=%s) ---%n", name, toc, sig);
        System.out.printf("  baseline heap: %,d KB%n", baseline / 1024);

        // Run each engine ITERATIONS times back-to-back; report median heap
        // and median wall-clock. Median filters out a single warm-up outlier
        // or a transient GC pause without needing to discard "the first run"
        // by hand.
        Path outPdfbox = workDir.resolve("out-" + name + "-pdfbox.pdf");
        IterResult pdfBox =
                runIterations("PDFBox", () -> runPdfBoxMerge(inputs, outPdfbox), baseline);
        int pdfBoxBookmarks = countBookmarks(outPdfbox);
        printIter("PDFBox", pdfBox, Files.size(outPdfbox), pdfBoxBookmarks);

        forceGcQuiescence();

        Path outJpdfium = workDir.resolve("out-" + name + "-jpdfium.pdf");
        IterResult jpdfium =
                runIterations("JPDFium", () -> runJpdfiumMerge(inputs, outJpdfium), baseline);
        int jpdfiumBookmarks = countBookmarks(outJpdfium);
        printIter("JPDFium", jpdfium, Files.size(outJpdfium), jpdfiumBookmarks);

        // Validation: with INTERNAL_BOOKMARKS=10 and DOC_COUNT=4 we expect
        // 40 source bookmarks. Adding TOC contributes 4 chapter headers.
        int expectedFromSources = INTERNAL_BOOKMARKS * inputs.size();
        int expectedTocChapters = toc ? inputs.size() : 0;
        System.out.printf(
                "  expected: %d source + %d TOC chapter = %d top-level bookmarks%n%n",
                expectedFromSources, expectedTocChapters,
                expectedFromSources + expectedTocChapters);

        return new ScenarioRow(
                name,
                pdfBox.medianHeapDelta,
                pdfBox.medianWallMs,
                jpdfium.medianHeapDelta,
                jpdfium.medianWallMs);
    }

    private record IterResult(
            long medianHeapDelta, long medianWallMs, long[] heapDeltas, long[] wallMsList) {}

    private static IterResult runIterations(
            String label, ThrowingRunnable task, long baseline) throws Exception {
        long[] heap = new long[ITERATIONS];
        long[] wall = new long[ITERATIONS];
        for (int i = 0; i < ITERATIONS; i++) {
            forceGcQuiescence();
            BenchResult r = profile(task);
            heap[i] = r.peakHeapBytes - baseline;
            wall[i] = r.wallMs;
        }
        return new IterResult(median(heap), median(wall), heap, wall);
    }

    private static void printIter(String label, IterResult r, long outBytes, int bookmarks)
            throws IOException {
        StringBuilder iters = new StringBuilder();
        if (ITERATIONS > 1) {
            iters.append("  (iterations: heap=[");
            for (int i = 0; i < r.heapDeltas.length; i++) {
                if (i > 0) iters.append(',');
                iters.append(r.heapDeltas[i] / 1024).append("KB");
            }
            iters.append("], wall=[");
            for (int i = 0; i < r.wallMsList.length; i++) {
                if (i > 0) iters.append(',');
                iters.append(r.wallMsList[i]).append("ms");
            }
            iters.append("])");
        }
        System.out.printf(
                "  %-7s : peak heap +%,d KB (median), wall %,d ms (median), out %,d KB, bookmarks=%d%s%n",
                label,
                r.medianHeapDelta / 1024,
                r.medianWallMs,
                outBytes / 1024,
                bookmarks,
                iters);
    }

    private static long median(long[] arr) {
        long[] sorted = arr.clone();
        java.util.Arrays.sort(sorted);
        int n = sorted.length;
        if (n % 2 == 1) return sorted[n / 2];
        return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    }

    private record ScenarioRow(
            String name, long pdfboxDelta, long pdfboxMs, long jpdfiumDelta, long jpdfiumMs) {}

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
                    "Scenario: TOC=%s, removeCertSign=%s, jpegQuality=%.2f%n",
                    withToc, withSigRemoval, JPEG_QUALITY);
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
            // normally amortised across many requests. For big inputs (>50 MB
            // per doc) we shrink the warmup to a single input — the JIT only
            // needs to see the hot code paths, not run on the full payload.
            long perDocBytes = Files.size(inputs.getFirst());
            List<Path> warmupInputs =
                    perDocBytes > 50L * 1024 * 1024
                            ? List.of(inputs.getFirst())
                            : inputs;
            System.out.printf(
                    "--- Warmup pass (results discarded, %d inputs) ---%n", warmupInputs.size());
            runPdfBoxMerge(warmupInputs, workDir.resolve("warmup-pdfbox.pdf"));
            runJpdfiumMerge(warmupInputs, workDir.resolve("warmup-jpdfium.pdf"));
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
            // Optional internal bookmarks — distributed evenly across the
            // document. With INTERNAL_BOOKMARKS=10 and pages=70, every 7th
            // page gets a "Section N" outline entry. We use this to test
            // that source bookmarks survive the merge.
            if (INTERNAL_BOOKMARKS > 0 && pages > 0) {
                PDDocumentOutline outline = new PDDocumentOutline();
                doc.getDocumentCatalog().setDocumentOutline(outline);
                int spacing = Math.max(1, pages / INTERNAL_BOOKMARKS);
                for (int b = 0; b < INTERNAL_BOOKMARKS; b++) {
                    int pageIdx = Math.min(b * spacing, pages - 1);
                    PDOutlineItem item = new PDOutlineItem();
                    item.setTitle(
                            "Section " + (b + 1) + " — " + out.getFileName().toString());
                    item.setDestination(doc.getPage(pageIdx));
                    outline.addLast(item);
                }
            }
            doc.save(out.toFile());
        }
    }

    /**
     * Open the merged PDF with JPDFium and count its bookmarks. Walks
     * children recursively so nested outlines (chapter → section → ...)
     * contribute every entry, not just the top level.
     */
    private static int countBookmarks(Path pdf) {
        try (PdfDocument doc = PdfDocument.open(pdf)) {
            int total = 0;
            for (stirling.software.jpdfium.doc.Bookmark bm : doc.bookmarks()) {
                total += countBookmarkSubtree(bm);
            }
            return total;
        } catch (Exception e) {
            System.out.printf("  bookmark count: <error reading: %s>%n", e.getMessage());
            return -1;
        }
    }

    private static int countBookmarkSubtree(stirling.software.jpdfium.doc.Bookmark bm) {
        int count = 1;
        if (bm.hasChildren()) {
            for (stirling.software.jpdfium.doc.Bookmark child : bm.children()) {
                count += countBookmarkSubtree(child);
            }
        }
        return count;
    }

    /**
     * Generate a unique-looking JPEG so PDF object dedup can't quietly
     * collapse all pages into one image stream. We sweep hue per page,
     * fill with random-noise pixels (high entropy → poor compression →
     * bigger output), and draw some random circles on top.
     *
     * <p>Pixel noise fill is the key: a flat-colour rectangle JPEG-compresses
     * to KBs regardless of dimensions; per-pixel random noise compresses
     * close to the raw byte count, which is what we need to push a 100-page
     * PDF into the hundreds-of-MB range.
     */
    private static byte[] generateRandomJpeg(Random rng, int w, int h) throws IOException {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        // High-entropy fill: per-pixel random RGB. Beats Graphics2D shapes
        // for resisting JPEG compression on the size we want.
        int[] pixels = new int[w * h];
        // Seed by ImageIdentityHash so each page is unique without holding
        // the per-pixel buffer beyond this scope.
        for (int i = 0; i < pixels.length; i++) {
            pixels[i] = rng.nextInt(0xFFFFFF);
        }
        img.setRGB(0, 0, w, h, pixels, 0, w);
        // Overlay shapes + a label so the image is still recognisable.
        Graphics2D g = img.createGraphics();
        try {
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
        // Honour JPEG_QUALITY so callers can dial the per-image size up or
        // down; default ImageIO.write uses ~0.75 which is too aggressive
        // when we want big inputs.
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try {
            ImageWriteParam params = writer.getDefaultWriteParam();
            params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            params.setCompressionQuality(JPEG_QUALITY);
            try (MemoryCacheImageOutputStream mcios = new MemoryCacheImageOutputStream(baos)) {
                writer.setOutput(mcios);
                writer.write(null, new IIOImage(img, null, null), params);
            }
        } finally {
            writer.dispose();
        }
        return baos.toByteArray();
    }

    private static void runPdfBoxMerge(List<Path> inputs, Path output) throws IOException {
        // Stage 1: PDFMergerUtility — fast stream-cache merge to a temp file.
        Path stage1 = output.resolveSibling(output.getFileName() + ".stage1");
        try {
            PDFMergerUtility merger = new PDFMergerUtility();
            for (Path p : inputs) {
                merger.addSource(p.toFile());
            }
            merger.setDestinationFileName(stage1.toAbsolutePath().toString());
            merger.mergeDocuments(null);

            // Stage 2: post-process (TOC / sig removal) only when needed.
            // Mirror MergeController's PRE-jpdfium behaviour: load with PDFBox,
            // mutate, save.
            if (withToc || withSigRemoval) {
                try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(stage1.toFile())) {
                    if (withSigRemoval) {
                        PDDocumentCatalog catalog = doc.getDocumentCatalog();
                        PDAcroForm form = catalog.getAcroForm();
                        if (form != null) {
                            List<PDField> sigs = form.getFields().stream()
                                    .filter(PDSignatureField.class::isInstance)
                                    .toList();
                            if (!sigs.isEmpty()) {
                                form.flatten(sigs, false);
                            }
                        }
                    }
                    if (withToc) {
                        PDDocumentOutline outline = new PDDocumentOutline();
                        doc.getDocumentCatalog().setDocumentOutline(outline);
                        int idx = 0;
                        for (int i = 0; i < inputs.size(); i++) {
                            PDOutlineItem item = new PDOutlineItem();
                            item.setTitle("doc-" + (char) ('a' + i));
                            if (idx < doc.getNumberOfPages()) {
                                item.setDestination(doc.getPage(idx));
                            }
                            outline.addLast(item);
                            // Hop forward by the source's page count — for this
                            // synthetic benchmark every input has PAGES_PER_DOC
                            // pages, so no need to re-open and count.
                            idx += PAGES_PER_DOC;
                        }
                    }
                    doc.save(output.toFile());
                }
            } else {
                java.nio.file.Files.move(stage1, output,
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            java.nio.file.Files.deleteIfExists(stage1);
        }
    }

    private static void runJpdfiumMerge(List<Path> inputs, Path output) throws IOException {
        // Mirror the production MergeController: capture each source's
        // bookmarks (with the page offset where its pages will land in the
        // merged doc), run the native page merge, then inject a combined
        // BookmarkTree via streaming setBookmarks. This preserves source
        // outlines (PDFium's FPDF_ImportPagesByIndex only carries pages,
        // not the outline tree).
        List<PdfDocument> docs = new ArrayList<>();
        int[] pageCounts = new int[inputs.size()];
        int[] pageOffsets = new int[inputs.size()];
        List<List<stirling.software.jpdfium.doc.Bookmark>> sourceBookmarks =
                new ArrayList<>(inputs.size());
        int runningOffset = 0;
        try {
            for (int i = 0; i < inputs.size(); i++) {
                PdfDocument d = PdfDocument.open(inputs.get(i));
                docs.add(d);
                pageCounts[i] = d.pageCount();
                pageOffsets[i] = runningOffset;
                sourceBookmarks.add(d.bookmarks());
                runningOffset += pageCounts[i];
            }

            BookmarkTree.Builder b = BookmarkTree.builder();
            if (withToc) {
                for (int i = 0; i < inputs.size(); i++) {
                    b.add("doc-" + (char) ('a' + i), pageOffsets[i]);
                }
            }
            for (int i = 0; i < sourceBookmarks.size(); i++) {
                addBookmarkFlat(b, sourceBookmarks.get(i), pageOffsets[i]);
            }
            BookmarkTree tree = b.build();

            try (PdfDocument merged = PdfMerge.merge(docs)) {
                if (!tree.entries().isEmpty()) {
                    PdfBookmarkEditor.setBookmarks(merged, tree, output);
                } else {
                    merged.save(output);
                }
            }
        } finally {
            for (PdfDocument d : docs) {
                try {
                    d.close();
                } catch (Exception ignored) {
                }
            }
        }

        // Sig removal is the only step still routed through PDFBox: JPDFium's
        // flatten is page-wide and would fuse non-signature widgets too. We
        // pre-check via JPDFium and skip the PDFBox load+save entirely when
        // there are no signature fields to flatten.
        boolean sigFlattenNeeded = false;
        if (withSigRemoval) {
            try (PdfDocument check = PdfDocument.open(output)) {
                sigFlattenNeeded = !check.signatures().isEmpty();
            } catch (Exception ignored) {
                sigFlattenNeeded = true;
            }
        }
        if (!sigFlattenNeeded) {
            return;
        }

        Path post = output.resolveSibling(output.getFileName() + ".post");
        try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(output.toFile())) {
            PDDocumentCatalog catalog = doc.getDocumentCatalog();
            PDAcroForm form = catalog.getAcroForm();
            if (form != null) {
                List<PDField> sigs = form.getFields().stream()
                        .filter(PDSignatureField.class::isInstance)
                        .toList();
                if (!sigs.isEmpty()) {
                    form.flatten(sigs, false);
                }
            }
            doc.save(post.toFile());
        }
        java.nio.file.Files.move(post, output, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }

    /**
     * Recursively flatten a source's bookmark list into top-level entries
     * of the combined BookmarkTree, translating each entry's pageIndex by
     * the offset where its source's pages were inserted.
     */
    private static void addBookmarkFlat(
            BookmarkTree.Builder builder,
            List<stirling.software.jpdfium.doc.Bookmark> bookmarks,
            int offset) {
        for (stirling.software.jpdfium.doc.Bookmark bm : bookmarks) {
            if (bm.isInternal() && bm.title() != null) {
                builder.add(bm.title(), offset + bm.pageIndex());
            }
            if (bm.hasChildren()) {
                addBookmarkFlat(builder, bm.children(), offset);
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
