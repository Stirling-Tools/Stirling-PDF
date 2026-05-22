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
import java.util.HashSet;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.FormUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfSplit;

/**
 * Apples-to-apples heap + wall-clock benchmark for split: legacy PDFBox path (load + addPage per
 * range + save) vs JPDFium path (PdfSplit.extractPageRange + save).
 *
 * <p>Generates a single ~N-page PDF with one JPEG per page, then performs a "split into chunks of
 * 10" run with both backends. Samples heap every 25 ms during execution.
 *
 * <p>Run only when explicitly requested: -Dsplit.bench=true
 */
public final class SplitBenchmark {

    private static final int PAGES = Integer.getInteger("split.bench.pages", 100);
    private static final int CHUNK = Integer.getInteger("split.bench.chunk", 10);
    private static final int IMAGE_W = Integer.getInteger("split.bench.imgW", 800);
    private static final int IMAGE_H = Integer.getInteger("split.bench.imgH", 600);
    private static final long SAMPLE_PERIOD_MS = 25L;

    @Test
    void compareSplitMemoryFootprint() throws Exception {
        if (!Boolean.getBoolean("split.bench")) {
            System.out.println("Skipping SplitBenchmark (run with -Dsplit.bench=true)");
            return;
        }
        main(new String[0]);
    }

    public static void main(String[] args) throws Exception {
        Path workDir = Files.createTempDirectory("split-bench-");
        System.out.println("Work dir: " + workDir);
        System.out.printf(
                "Generating %d-page input PDF with %dx%d images per page...%n",
                PAGES, IMAGE_W, IMAGE_H);

        Path input = workDir.resolve("input.pdf");
        long t0 = System.nanoTime();
        generateTestPdf(input, PAGES);
        long buildMs = (System.nanoTime() - t0) / 1_000_000;
        System.out.printf(
                "  built %s: %,d KB (%d pages) in %,d ms%n%n",
                input.getFileName(), Files.size(input) / 1024, PAGES, buildMs);

        // Warmup - prime classloaders, JIT, native lib.
        System.out.println("--- Warmup (results discarded) ---");
        runPdfBoxSplit(input, workDir.resolve("warmup-pdfbox"), CHUNK);
        runJpdfiumSplit(input, workDir.resolve("warmup-jpdfium"), CHUNK);
        forceGcQuiescence();
        System.out.println();

        long baseline = sampleUsedHeapAfterGc();
        System.out.printf("Baseline heap (after GC, before split): %,d KB%n%n", baseline / 1024);

        // PDFBox run
        System.out.println("--- PDFBox split (load + addPage + save per chunk) ---");
        Path outBoxDir = workDir.resolve("out-pdfbox");
        BenchResult pdfboxResult = profile(() -> runPdfBoxSplit(input, outBoxDir, CHUNK));
        pdfboxResult.printSummary("PDFBox", baseline);

        forceGcQuiescence();
        System.out.println();

        // JPDFium run
        System.out.println("--- JPDFium split (PdfSplit.extractPageRange + save) ---");
        Path outJpdDir = workDir.resolve("out-jpdfium");
        BenchResult jpdfiumResult = profile(() -> runJpdfiumSplit(input, outJpdDir, CHUNK));
        jpdfiumResult.printSummary("JPDFium", baseline);

        // Compare
        System.out.println();
        System.out.println("=== Heap delta over baseline ===");
        long pdfboxDelta = pdfboxResult.peakHeapBytes - baseline;
        long jpdfiumDelta = jpdfiumResult.peakHeapBytes - baseline;
        double improvement =
                pdfboxDelta == 0 ? 0.0 : (100.0 * (pdfboxDelta - jpdfiumDelta) / pdfboxDelta);
        System.out.printf("  PDFBox  : +%,d KB%n", pdfboxDelta / 1024);
        System.out.printf("  JPDFium : +%,d KB%n", jpdfiumDelta / 1024);
        System.out.printf("  JPDFium uses %.1f%% LESS heap than PDFBox%n", improvement);

        System.out.println();
        System.out.println("=== Wall-clock ===");
        System.out.printf("  PDFBox  : %,d ms%n", pdfboxResult.wallMs);
        System.out.printf("  JPDFium : %,d ms%n", jpdfiumResult.wallMs);
        double speedup =
                jpdfiumResult.wallMs == 0
                        ? 0.0
                        : ((double) pdfboxResult.wallMs / jpdfiumResult.wallMs);
        System.out.printf("  Speedup : %.2fx%n", speedup);

        // Hybrid form-pruning sub-benchmark.
        // Quantifies the heap re-introduced by the PDFBox post-pass that
        // pruneOrphanedFormFields runs on each JPDFium-produced split.
        System.out.println();
        System.out.println("=== Hybrid form-pruning sub-benchmark ===");
        Path formInput = workDir.resolve("form-input.pdf");
        generateFormPdf(formInput, PAGES);
        System.out.printf(
                "  built %s with AcroForm: %,d KB (%d pages)%n",
                formInput.getFileName(), Files.size(formInput) / 1024, PAGES);

        runJpdfiumSplit(formInput, workDir.resolve("warmup-form-bare"), CHUNK);
        runJpdfiumSplitWithFormPrune(formInput, workDir.resolve("warmup-form-pruned"), CHUNK);
        forceGcQuiescence();

        BenchResult bareForm =
                profile(() -> runJpdfiumSplit(formInput, workDir.resolve("out-form-bare"), CHUNK));
        bareForm.printSummary("JPDFium-only", sampleUsedHeapAfterGc());

        forceGcQuiescence();
        BenchResult prunedForm =
                profile(
                        () ->
                                runJpdfiumSplitWithFormPrune(
                                        formInput, workDir.resolve("out-form-pruned"), CHUNK));
        prunedForm.printSummary("JPDFium+PDFBox-prune", sampleUsedHeapAfterGc());

        long pruneOverhead = prunedForm.peakHeapBytes - bareForm.peakHeapBytes;
        long pruneTimeOverhead = prunedForm.wallMs - bareForm.wallMs;
        System.out.printf(
                "  Hybrid prune overhead: +%,d KB heap, +%,d ms wall (%.1fx slower)%n",
                pruneOverhead / 1024,
                pruneTimeOverhead,
                bareForm.wallMs == 0 ? 0.0 : (double) prunedForm.wallMs / bareForm.wallMs);
    }

    private static void runJpdfiumSplitWithFormPrune(Path input, Path outDir, int chunk)
            throws IOException {
        Files.createDirectories(outDir);
        try (PdfDocument source = PdfDocument.open(input)) {
            int total = source.pageCount();
            int index = 0;
            for (int start = 0; start < total; start += chunk) {
                int end = Math.min(start + chunk - 1, total - 1);
                Path raw = outDir.resolve("raw-" + (index + 1) + ".pdf");
                try (PdfDocument split = PdfSplit.extractPageRange(source, start, end)) {
                    split.save(raw);
                }
                Path pruned = outDir.resolve("pruned-" + (++index) + ".pdf");
                try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(raw.toFile())) {
                    FormUtils.pruneOrphanedFormFields(doc);
                    doc.save(pruned.toFile());
                }
                Files.deleteIfExists(raw);
            }
        }
    }

    private static void generateFormPdf(Path out, int pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
            }
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            // One text field per page (orphan-prone scenario).
            for (int i = 0; i < pages; i++) {
                PDTextField field = new PDTextField(acroForm);
                field.setPartialName("field_" + i);
                acroForm.getFields().add(field);
                PDAnnotationWidget widget = new PDAnnotationWidget();
                widget.setRectangle(new PDRectangle(50, 50, 200, 30));
                widget.setPage(doc.getPage(i));
                doc.getPage(i).getAnnotations().add(widget);
                field.getWidgets().add(widget);
            }
            doc.save(out.toFile());
        }
    }

    private static void runPdfBoxSplit(Path input, Path outDir, int chunk) throws IOException {
        Files.createDirectories(outDir);
        try (PDDocument source = org.apache.pdfbox.Loader.loadPDF(input.toFile())) {
            int total = source.getNumberOfPages();
            int index = 0;
            for (int start = 0; start < total; start += chunk) {
                int end = Math.min(start + chunk - 1, total - 1);
                Set<Integer> keep = new HashSet<>();
                for (int p = start; p <= end; p++) keep.add(p);
                // Match the pre-jpdfium reload path: load fresh, removePage, save.
                try (PDDocument split = org.apache.pdfbox.Loader.loadPDF(input.toFile())) {
                    for (int p = split.getNumberOfPages() - 1; p >= 0; p--) {
                        if (!keep.contains(p)) split.removePage(p);
                    }
                    split.save(outDir.resolve("split-" + (++index) + ".pdf").toFile());
                }
            }
        }
    }

    private static void runJpdfiumSplit(Path input, Path outDir, int chunk) throws IOException {
        Files.createDirectories(outDir);
        try (PdfDocument source = PdfDocument.open(input)) {
            int total = source.pageCount();
            int index = 0;
            for (int start = 0; start < total; start += chunk) {
                int end = Math.min(start + chunk - 1, total - 1);
                try (PdfDocument split = PdfSplit.extractPageRange(source, start, end)) {
                    split.save(outDir.resolve("split-" + (++index) + ".pdf"));
                }
            }
        }
    }

    private static void generateTestPdf(Path out, int pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            Random rng = new Random(42L);
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);

                byte[] jpegBytes = generateRandomJpeg(rng, IMAGE_W, IMAGE_H);
                PDImageXObject xobj = PDImageXObject.createFromByteArray(doc, jpegBytes, "img");

                try (PDPageContentStream cs =
                        new PDPageContentStream(
                                doc, page, PDPageContentStream.AppendMode.APPEND, false)) {
                    float pageW = page.getMediaBox().getWidth();
                    float pageH = page.getMediaBox().getHeight();
                    float imgW = pageW - 100;
                    float imgH = imgW * IMAGE_H / IMAGE_W;
                    float x = (pageW - imgW) / 2;
                    float y = pageH - 80 - imgH;
                    cs.drawImage(xobj, x, y, imgW, imgH);
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14);
                    cs.newLineAtOffset(50, 30);
                    cs.showText("Page " + (i + 1) + " bench fill");
                    cs.endText();
                }
            }
            doc.save(out.toFile());
        }
    }

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
            g.drawString("bench image", 40, h - 40);
        } finally {
            g.dispose();
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", baos);
        return baos.toByteArray();
    }

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
                                peakHeap.updateAndGet(p -> Math.max(p, heap.getUsed()));
                                peakNonHeap.updateAndGet(p -> Math.max(p, nonHeap.getUsed()));
                                try {
                                    Thread.sleep(SAMPLE_PERIOD_MS);
                                } catch (InterruptedException e) {
                                    Thread.currentThread().interrupt();
                                    return;
                                }
                            }
                        },
                        "split-bench-sampler");
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
    interface ThrowingRunnable {
        void run() throws Exception;
    }

    private record BenchResult(long peakHeapBytes, long peakNonHeapBytes, long wallMs) {
        void printSummary(String label, long baselineBytes) {
            System.out.printf(
                    "  %s peak heap    : %,d KB (delta over baseline: +%,d KB)%n",
                    label, peakHeapBytes / 1024, (peakHeapBytes - baselineBytes) / 1024);
            System.out.printf("  %s peak nonHeap : %,d KB%n", label, peakNonHeapBytes / 1024);
            System.out.printf("  %s wall-clock   : %,d ms%n", label, wallMs);
        }
    }
}
