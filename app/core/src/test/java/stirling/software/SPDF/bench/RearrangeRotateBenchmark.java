package stirling.software.SPDF.bench;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.lang.foreign.MemorySegment;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.PdfPageEditor;
import stirling.software.jpdfium.doc.PdfPageImporter;

/**
 * Heap + wall-clock benchmark: PDFBox vs JPDFium for rotate, rearrange, delete-pages, and the
 * detectAcroForm() probe. Run with -Drearrange.bench=true.
 */
public final class RearrangeRotateBenchmark {

    private static final int PAGES = Integer.getInteger("rearrange.bench.pages", 100);
    private static final int IMAGE_W = Integer.getInteger("rearrange.bench.imgW", 800);
    private static final int IMAGE_H = Integer.getInteger("rearrange.bench.imgH", 600);
    private static final float JPEG_QUALITY =
            Float.parseFloat(System.getProperty("rearrange.bench.jpegQ", "0.6"));
    private static final int ITERATIONS =
            Math.max(1, Integer.getInteger("rearrange.bench.iterations", 3));
    private static final long SAMPLE_PERIOD_MS = 25L;

    @Test
    @EnabledIfSystemProperty(named = "rearrange.bench", matches = "true")
    void compareRearrangeRotateScenarios() throws Exception {
        Path workDir = Files.createTempDirectory("rearrange-bench-");
        System.out.println("Work dir: " + workDir);

        Path plainPdf = workDir.resolve("plain.pdf");
        Path formPdf = workDir.resolve("form.pdf");
        Path heavyFormPdf = workDir.resolve("heavy-form.pdf");
        System.out.printf(
                "Generating %d-page non-form PDF (%dx%d @ q=%.2f)...%n",
                PAGES, IMAGE_W, IMAGE_H, JPEG_QUALITY);
        generatePlainPdf(plainPdf, PAGES);
        generateFormPdf(formPdf, PAGES);
        generateHeavyFormPdf(heavyFormPdf, PAGES, Math.max(PAGES, 1000));
        System.out.printf(
                "  plain: %,d KB, form: %,d KB, heavy-form: %,d KB%n%n",
                Files.size(plainPdf) / 1024,
                Files.size(formPdf) / 1024,
                Files.size(heavyFormPdf) / 1024);

        // Warmup
        System.out.println("--- Warmup ---");
        runPdfBoxRotate(plainPdf, workDir.resolve("warmup-pb-rot.pdf"));
        runJpdfiumRotate(plainPdf, workDir.resolve("warmup-jp-rot.pdf"));
        runPdfBoxRearrange(plainPdf, workDir.resolve("warmup-pb-rea.pdf"));
        runJpdfiumRearrange(plainPdf, workDir.resolve("warmup-jp-rea.pdf"));
        runPdfBoxDelete(plainPdf, workDir.resolve("warmup-pb-del.pdf"));
        runJpdfiumDelete(plainPdf, workDir.resolve("warmup-jp-del.pdf"));
        forceGcQuiescence();
        System.out.println();

        List<Row> rows = new ArrayList<>();
        rows.add(
                bench(
                        "rotate (plain)",
                        () -> runPdfBoxRotate(plainPdf, workDir.resolve("out-pb-rot.pdf")),
                        () -> runJpdfiumRotate(plainPdf, workDir.resolve("out-jp-rot.pdf"))));
        rows.add(
                bench(
                        "rearrange (plain)",
                        () -> runPdfBoxRearrange(plainPdf, workDir.resolve("out-pb-rea.pdf")),
                        () -> runJpdfiumRearrange(plainPdf, workDir.resolve("out-jp-rea.pdf"))));
        rows.add(
                bench(
                        "delete (plain)",
                        () -> runPdfBoxDelete(plainPdf, workDir.resolve("out-pb-del.pdf")),
                        () -> runJpdfiumDelete(plainPdf, workDir.resolve("out-jp-del.pdf"))));
        // Probe-only - this is what the controller pays on EVERY request as overhead
        rows.add(
                bench(
                        "detectAcroForm (plain)",
                        () -> detectAcroFormPdfBoxLike(plainPdf),
                        () -> detectAcroFormJpdfium(plainPdf)));
        rows.add(
                bench(
                        "detectAcroForm (form)",
                        () -> detectAcroFormPdfBoxLike(formPdf),
                        () -> detectAcroFormJpdfium(formPdf)));
        rows.add(
                bench(
                        "detectAcroForm (heavy-form 1000 fields)",
                        () -> detectAcroFormPdfBoxLike(heavyFormPdf),
                        () -> detectAcroFormJpdfium(heavyFormPdf)));
        // Hybrid path total cost (probe + JPDFium operation) for a non-form PDF
        rows.add(
                bench(
                        "rearrange total (plain, probe+JPDFium)",
                        () -> runPdfBoxRearrange(plainPdf, workDir.resolve("out-pb-tot.pdf")),
                        () -> {
                            detectAcroFormPdfBoxLike(plainPdf);
                            runJpdfiumRearrange(plainPdf, workDir.resolve("out-jp-tot.pdf"));
                        }));

        // Probe on a real-world signed form PDF if it exists nearby
        Path realForm = Path.of(System.getProperty("rearrange.bench.realForm", ""));
        if (Files.exists(realForm)) {
            System.out.printf(
                    "Real-world form PDF found: %s (%d KB)%n%n",
                    realForm, Files.size(realForm) / 1024);
            rows.add(
                    bench(
                            "detectAcroForm (real-world form)",
                            () -> detectAcroFormPdfBoxLike(realForm),
                            () -> detectAcroFormJpdfium(realForm)));
        }

        System.out.println();
        System.out.println(
                "================================== Summary ==================================");
        System.out.printf(
                "%-42s | %-22s | %-22s | %-12s%n",
                "Scenario", "PDFBox peak heap Δ", "JPDFium peak heap Δ", "Heap save");
        System.out.println(
                "------------------------------------------+------------------------+------------------------+------------");
        for (Row r : rows) {
            double saving =
                    r.pdfboxHeap == 0 ? 0.0 : 100.0 * (r.pdfboxHeap - r.jpdfiumHeap) / r.pdfboxHeap;
            System.out.printf(
                    "%-42s | %,17d KB    | %,17d KB    | %6.1f%%%n",
                    r.name, r.pdfboxHeap / 1024, r.jpdfiumHeap / 1024, saving);
        }
        System.out.println(
                "------------------------------------------+------------------------+------------------------+------------");
        System.out.printf(
                "%-42s | %-22s | %-22s | %-12s%n",
                "Wall-clock", "PDFBox ms", "JPDFium ms", "Speedup");
        System.out.println(
                "------------------------------------------+------------------------+------------------------+------------");
        for (Row r : rows) {
            double speedup = r.jpdfiumMs == 0 ? 0.0 : (double) r.pdfboxMs / r.jpdfiumMs;
            System.out.printf(
                    "%-42s | %,17d ms    | %,17d ms    | %5.2fx%n",
                    r.name, r.pdfboxMs, r.jpdfiumMs, speedup);
        }
    }

    private record Row(
            String name, long pdfboxHeap, long pdfboxMs, long jpdfiumHeap, long jpdfiumMs) {}

    private static Row bench(String label, ThrowingRunnable pdfbox, ThrowingRunnable jpdfium)
            throws Exception {
        System.out.printf("--- %s ---%n", label);
        forceGcQuiescence();
        long base = sampleUsedHeapAfterGc();
        IterResult pb = runIterations(pdfbox, base);
        forceGcQuiescence();
        IterResult jp = runIterations(jpdfium, base);
        System.out.printf(
                "  PDFBox  : heap +%,d KB (median), wall %,d ms (median)%n",
                pb.medianHeap / 1024, pb.medianMs);
        System.out.printf(
                "  JPDFium : heap +%,d KB (median), wall %,d ms (median)%n%n",
                jp.medianHeap / 1024, jp.medianMs);
        return new Row(label, pb.medianHeap, pb.medianMs, jp.medianHeap, jp.medianMs);
    }

    private record IterResult(long medianHeap, long medianMs) {}

    private static IterResult runIterations(ThrowingRunnable task, long baseline) throws Exception {
        long[] heap = new long[ITERATIONS];
        long[] wall = new long[ITERATIONS];
        for (int i = 0; i < ITERATIONS; i++) {
            forceGcQuiescence();
            BenchResult r = profile(task);
            heap[i] = Math.max(0, r.peakHeapBytes - baseline);
            wall[i] = r.wallMs;
        }
        return new IterResult(median(heap), median(wall));
    }

    private static long median(long[] arr) {
        long[] sorted = arr.clone();
        java.util.Arrays.sort(sorted);
        int n = sorted.length;
        if (n % 2 == 1) return sorted[n / 2];
        return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    }

    // ---- Operations ----

    private static void runPdfBoxRotate(Path in, Path out) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBufferedFile(in.toFile()))) {
            for (PDPage page : doc.getPages()) {
                page.setRotation(page.getRotation() + 90);
            }
            doc.save(out.toFile());
        }
    }

    private static void runJpdfiumRotate(Path in, Path out) throws IOException {
        try (PdfDocument doc = PdfDocument.open(in)) {
            int pageCount = doc.pageCount();
            for (int i = 0; i < pageCount; i++) {
                try (PdfPage page = doc.page(i)) {
                    MemorySegment rawPage = page.rawHandle();
                    int current = PdfPageEditor.getRotation(rawPage);
                    PdfPageEditor.setRotation(rawPage, Math.floorMod(current + 1, 4));
                }
            }
            doc.save(out);
        }
    }

    private static void runPdfBoxRearrange(Path in, Path out) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBufferedFile(in.toFile()))) {
            int total = doc.getNumberOfPages();
            // reverse order
            List<PDPage> pages = new ArrayList<>(total);
            for (int i = total - 1; i >= 0; i--) {
                pages.add(doc.getPage(i));
            }
            try (PDDocument copy = new PDDocument()) {
                for (PDPage p : pages) copy.addPage(p);
                copy.save(out.toFile());
            }
        }
    }

    private static void runJpdfiumRearrange(Path in, Path out) throws IOException {
        try (PdfDocument doc = PdfDocument.open(in)) {
            int total = doc.pageCount();
            int[] indices = new int[total];
            for (int i = 0; i < total; i++) indices[i] = total - 1 - i;
            MemorySegment rawDoc = doc.rawHandle();
            PdfPageImporter.importPagesByIndex(rawDoc, rawDoc, indices, total);
            for (int i = total - 1; i >= 0; i--) {
                PdfPageEditor.deletePage(rawDoc, i);
            }
            doc.save(out);
        }
    }

    private static void runPdfBoxDelete(Path in, Path out) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBufferedFile(in.toFile()))) {
            // Remove odd indices (1,3,5,...) descending
            int total = doc.getNumberOfPages();
            List<Integer> remove = new ArrayList<>();
            for (int i = 1; i < total; i += 2) remove.add(i);
            Collections.sort(remove);
            for (int i = remove.size() - 1; i >= 0; i--) {
                doc.removePage(remove.get(i));
            }
            doc.save(out.toFile());
        }
    }

    private static void runJpdfiumDelete(Path in, Path out) throws IOException {
        try (PdfDocument doc = PdfDocument.open(in)) {
            int total = doc.pageCount();
            List<Integer> remove = new ArrayList<>();
            for (int i = 1; i < total; i += 2) remove.add(i);
            Collections.sort(remove);
            MemorySegment rawDoc = doc.rawHandle();
            for (int i = remove.size() - 1; i >= 0; i--) {
                PdfPageEditor.deletePage(rawDoc, remove.get(i));
            }
            doc.save(out);
        }
    }

    /**
     * Mimics RearrangePagesPDFController.detectAcroForm() - this is the "cheap-read" probe being
     * audited. Uses the same PDFBox load+catalog+getAcroForm sequence the controller uses.
     */
    private static boolean detectAcroFormPdfBoxLike(Path pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(new RandomAccessReadBufferedFile(pdf.toFile()))) {
            PDDocumentCatalog catalog = document.getDocumentCatalog();
            if (catalog == null) return false;
            return catalog.getAcroForm(null) != null;
        }
    }

    /**
     * Alternate AcroForm detection via JPDFium - open the doc and probe page 0 for any form
     * widgets. This is a representative "JPDFium-native form detection" the controller could use
     * instead of the PDFBox probe.
     */
    private static boolean detectAcroFormJpdfium(Path pdf) throws IOException {
        try (PdfDocument doc = PdfDocument.open(pdf)) {
            if (doc.pageCount() == 0) return false;
            try (PdfPage page = doc.page(0)) {
                List<stirling.software.jpdfium.doc.FormField> fields =
                        stirling.software.jpdfium.doc.PdfFormReader.readPage(
                                doc.rawHandle(), page.rawHandle(), 0);
                return !fields.isEmpty();
            }
        }
    }

    // ---- Synthetic PDF generation (lifted from MergeBenchmark template) ----

    private static void generatePlainPdf(Path out, int pages) throws IOException {
        Random rng = new Random(42);
        try (PDDocument doc = new PDDocument()) {
            byte[] jpeg = generateRandomJpeg(rng, IMAGE_W, IMAGE_H);
            PDImageXObject xobj = PDImageXObject.createFromByteArray(doc, jpeg, "page-image");
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    float pageW = page.getMediaBox().getWidth();
                    float pageH = page.getMediaBox().getHeight();
                    float scale = Math.min(pageW / IMAGE_W, pageH / IMAGE_H) * 0.9f;
                    float renderW = IMAGE_W * scale;
                    float renderH = IMAGE_H * scale;
                    float x = (pageW - renderW) / 2f;
                    float y = (pageH - renderH) / 2f + 30f;
                    cs.drawImage(xobj, x, y, renderW, renderH);
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14);
                    cs.newLineAtOffset(50, 30);
                    cs.showText("Page " + (i + 1));
                    cs.endText();
                }
            }
            doc.save(out.toFile());
        }
    }

    private static void generateFormPdf(Path out, int pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            List<PDPage> pageList = new ArrayList<>();
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                pageList.add(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 24);
                    cs.newLineAtOffset(72, 720);
                    cs.showText("Form Page " + (i + 1));
                    cs.endText();
                }
            }
            PDAcroForm acroForm = new PDAcroForm(doc);
            acroForm.setDefaultResources(new PDResources());
            acroForm.setDefaultAppearance("/Helv 12 Tf 0 g");
            acroForm.setNeedAppearances(true);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            List<PDField> fields = new ArrayList<>();
            for (int i = 0; i < Math.min(pages, 50); i++) {
                PDTextField textField = new PDTextField(acroForm);
                textField.setPartialName("field" + i);
                PDAnnotationWidget widget = new PDAnnotationWidget();
                widget.setRectangle(new PDRectangle(50, 700, 200, 20));
                widget.setPage(pageList.get(i));
                List<PDAnnotationWidget> widgets = new ArrayList<>();
                widgets.add(widget);
                textField.setWidgets(widgets);
                pageList.get(i).getAnnotations().add(widget);
                fields.add(textField);
            }
            acroForm.setFields(fields);
            doc.getDocumentCatalog()
                    .getCOSObject()
                    .setItem(COSName.ACRO_FORM, acroForm.getCOSObject());
            doc.save(out.toFile());
        }
    }

    /** PDF with many AcroForm fields - tests whether detectAcroForm() forces deep parsing. */
    private static void generateHeavyFormPdf(Path out, int pages, int fields) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            List<PDPage> pageList = new ArrayList<>();
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                pageList.add(page);
            }
            PDAcroForm acroForm = new PDAcroForm(doc);
            acroForm.setDefaultResources(new PDResources());
            acroForm.setDefaultAppearance("/Helv 12 Tf 0 g");
            acroForm.setNeedAppearances(true);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            List<PDField> fieldList = new ArrayList<>(fields);
            for (int i = 0; i < fields; i++) {
                PDTextField tf = new PDTextField(acroForm);
                tf.setPartialName("heavyField" + i);
                PDAnnotationWidget widget = new PDAnnotationWidget();
                widget.setRectangle(new PDRectangle(50, 700 - (i % 30) * 20, 200, 18));
                PDPage host = pageList.get(i % pageList.size());
                widget.setPage(host);
                List<PDAnnotationWidget> widgets = new ArrayList<>();
                widgets.add(widget);
                tf.setWidgets(widgets);
                host.getAnnotations().add(widget);
                fieldList.add(tf);
            }
            acroForm.setFields(fieldList);
            doc.getDocumentCatalog()
                    .getCOSObject()
                    .setItem(COSName.ACRO_FORM, acroForm.getCOSObject());
            doc.save(out.toFile());
        }
    }

    private static byte[] generateRandomJpeg(Random rng, int w, int h) throws IOException {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        int[] pixels = new int[w * h];
        for (int i = 0; i < pixels.length; i++) {
            pixels[i] = rng.nextInt(0xFFFFFF);
        }
        img.setRGB(0, 0, w, h, pixels, 0, w);
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

    // ---- Heap sampler ----

    private static BenchResult profile(ThrowingRunnable task) throws Exception {
        forceGcQuiescence();
        MemoryMXBean mem = ManagementFactory.getMemoryMXBean();
        AtomicLong peakHeap = new AtomicLong(0);
        AtomicBoolean stop = new AtomicBoolean(false);
        Thread sampler =
                new Thread(
                        () -> {
                            while (!stop.get()) {
                                MemoryUsage heap = mem.getHeapMemoryUsage();
                                peakHeap.updateAndGet(prev -> Math.max(prev, heap.getUsed()));
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
        return new BenchResult(peakHeap.get(), wallMs);
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
    private interface ThrowingRunnable {
        void run() throws Exception;
    }

    private record BenchResult(long peakHeapBytes, long wallMs) {}
}
