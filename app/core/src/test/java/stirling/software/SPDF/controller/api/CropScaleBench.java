package stirling.software.SPDF.controller.api;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.PdfMarginAdjuster;
import stirling.software.jpdfium.doc.PdfPageScaler;
import stirling.software.jpdfium.doc.PdfPosterizer.PaperSize;
import stirling.software.jpdfium.model.PageSize;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.transform.PdfPageBoxes;

/** Bench gated on -Djpdfium.bench=true. Compares JPDFium crop+scale vs PDFBox baselines. */
@EnabledIfSystemProperty(named = "jpdfium.bench", matches = "true")
class CropScaleBench {

    private static final int WARMUPS = 2;
    private static final int RUNS = 5;
    private static final int PAGES = Integer.getInteger("crop.bench.pages", 60);
    private static final int IMG_W = Integer.getInteger("crop.bench.imgW", 1200);
    private static final int IMG_H = Integer.getInteger("crop.bench.imgH", 1600);

    @Test
    void cropAndScale(@TempDir Path tmp) throws IOException {
        Path imageHeavy = tmp.resolve("image_heavy.pdf");
        buildImageHeavyPdf(imageHeavy, PAGES);
        long sizeBytes = Files.size(imageHeavy);

        for (int i = 0; i < WARMUPS; i++) {
            runPdfBoxCrop(imageHeavy);
            runJpdfiumCrop(imageHeavy);
            runPdfBoxScale(imageHeavy);
            runJpdfiumScale(imageHeavy);
        }

        Stats pdfboxCrop = bench(() -> runPdfBoxCrop(imageHeavy));
        Stats jpdfiumCrop = bench(() -> runJpdfiumCrop(imageHeavy));
        Stats pdfboxScale = bench(() -> runPdfBoxScale(imageHeavy));
        Stats jpdfiumScale = bench(() -> runJpdfiumScale(imageHeavy));

        System.out.println("=== CropScaleBench ===");
        System.out.printf(
                "input: %d KB (%d pages, %dx%d JPEGs)%n", sizeBytes / 1024, PAGES, IMG_W, IMG_H);
        System.out.printf("runs: %d after %d warmups%n", RUNS, WARMUPS);
        report("PDFBox  crop", pdfboxCrop);
        report("JPDFium crop", jpdfiumCrop);
        report("PDFBox  scale", pdfboxScale);
        report("JPDFium scale", jpdfiumScale);
        System.out.printf(
                "crop delta  (jpdfium-pdfbox):  wall=%+.1fms  heap=%+.1fMB%n",
                jpdfiumCrop.avgMillis - pdfboxCrop.avgMillis,
                jpdfiumCrop.avgPeakHeapMb - pdfboxCrop.avgPeakHeapMb);
        System.out.printf(
                "scale delta (jpdfium-pdfbox):  wall=%+.1fms  heap=%+.1fMB%n",
                jpdfiumScale.avgMillis - pdfboxScale.avgMillis,
                jpdfiumScale.avgPeakHeapMb - pdfboxScale.avgPeakHeapMb);

        // Auto-crop renders every page via PdfImageConverter at 150 DPI.
        // Canary single run to surface heap pressure on image-heavy input.
        System.gc();
        long h0 = usedHeap();
        long t0 = System.nanoTime();
        runJpdfiumAutoCrop(imageHeavy);
        long t1 = System.nanoTime();
        long h1 = usedHeap();
        System.out.printf(
                "JPDFium auto-crop (1 run): wall=%.1fms  heapDelta=%.1fMB%n",
                (t1 - t0) / 1_000_000.0, Math.max(0, h1 - h0) / (1024.0 * 1024.0));
    }

    private static void report(String label, Stats s) {
        System.out.printf(
                "%-13s  wall=%7.1fms  peakHeap=%6.1fMB%n", label, s.avgMillis, s.avgPeakHeapMb);
    }

    // PDFBox crop matching pre-migration CropController.cropWithPDFBox.
    private void runPdfBoxCrop(Path in) throws IOException {
        byte[] bytes = Files.readAllBytes(in);
        try (PDDocument src = Loader.loadPDF(bytes);
                PDDocument dst = new PDDocument()) {
            LayerUtility layerUtility = new LayerUtility(dst);
            float cropX = 50, cropY = 50, cropW = 500, cropH = 680;
            for (int i = 0; i < src.getNumberOfPages(); i++) {
                PDPage sourcePage = src.getPage(i);
                PDPage newPage = new PDPage(sourcePage.getMediaBox());
                dst.addPage(newPage);
                try (PDPageContentStream cs =
                        new PDPageContentStream(dst, newPage, AppendMode.OVERWRITE, true, true)) {
                    PDFormXObject form = layerUtility.importPageAsForm(src, i);
                    cs.saveGraphicsState();
                    cs.addRect(cropX, cropY, cropW, cropH);
                    cs.clip();
                    cs.drawForm(form);
                    cs.restoreGraphicsState();
                }
                newPage.setMediaBox(new PDRectangle(cropX, cropY, cropW, cropH));
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            dst.save(out);
        }
    }

    private void runJpdfiumCrop(Path in) throws IOException {
        float cropX = 50, cropY = 50, cropW = 500, cropH = 680;
        try (PdfDocument doc = PdfDocument.open(in)) {
            int n = doc.pageCount();
            for (int i = 0; i < n; i++) {
                PageSize size;
                try (PdfPage page = doc.page(i)) {
                    size = page.size();
                }
                float left = -cropX;
                float bottom = -cropY;
                float right = cropW - size.width() + cropX;
                float top = cropH - size.height() + cropY;
                PdfMarginAdjuster.addMargins(doc, i, left, bottom, right, top);
            }
            doc.saveBytes();
        }
    }

    // PDFBox scale matching pre-migration ScalePagesController.scalePages.
    private void runPdfBoxScale(Path in) throws IOException {
        byte[] bytes = Files.readAllBytes(in);
        PDRectangle target = PDRectangle.A4;
        float scaleFactor = 0.75f;
        try (PDDocument src = Loader.loadPDF(bytes);
                PDDocument dst = new PDDocument()) {
            LayerUtility layerUtility = new LayerUtility(dst);
            for (int i = 0; i < src.getNumberOfPages(); i++) {
                PDRectangle sourceSize = src.getPage(i).getMediaBox();
                float scaleW = target.getWidth() / sourceSize.getWidth();
                float scaleH = target.getHeight() / sourceSize.getHeight();
                float scale = Math.min(scaleW, scaleH) * scaleFactor;
                PDPage newPage = new PDPage(target);
                dst.addPage(newPage);
                try (PDPageContentStream cs =
                        new PDPageContentStream(
                                dst, newPage, PDPageContentStream.AppendMode.APPEND, true, true)) {
                    float x = (target.getWidth() - sourceSize.getWidth() * scale) / 2;
                    float y = (target.getHeight() - sourceSize.getHeight() * scale) / 2;
                    cs.saveGraphicsState();
                    cs.transform(Matrix.getTranslateInstance(x, y));
                    cs.transform(Matrix.getScaleInstance(scale, scale));
                    PDFormXObject form = layerUtility.importPageAsForm(src, i);
                    cs.drawForm(form);
                    cs.restoreGraphicsState();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            dst.save(out);
        }
    }

    private void runJpdfiumScale(Path in) throws IOException {
        float targetW = 595.27563f, targetH = 841.8898f; // A4
        float scaleFactor = 0.75f;
        try (PdfDocument doc = PdfDocument.open(in)) {
            float virtualW = targetW * scaleFactor;
            float virtualH = targetH * scaleFactor;
            PaperSize virtualPaper = new PaperSize(virtualW, virtualH, "virtual");
            int n = doc.pageCount();
            for (int i = 0; i < n; i++) {
                PdfPageScaler.scale(doc, i, virtualPaper, PdfPageScaler.FitMode.FIT_PAGE);
                float offX = (virtualW - targetW) / 2f;
                float offY = (virtualH - targetH) / 2f;
                Rect box = Rect.of(offX, offY, targetW, targetH);
                try (PdfPage page = doc.page(i)) {
                    PdfPageBoxes.setMediaBox(page.rawHandle(), box);
                    PdfPageBoxes.setCropBox(page.rawHandle(), box);
                }
            }
            doc.saveBytes();
        }
    }

    // Mirrors the auto-crop hot path: renders each page then mutates margins.
    private void runJpdfiumAutoCrop(Path in) throws IOException {
        try (PdfDocument doc = PdfDocument.open(in)) {
            int n = doc.pageCount();
            for (int i = 0; i < n; i++) {
                BufferedImage img =
                        stirling.software.jpdfium.PdfImageConverter.pageToImage(doc, i, 150);
                PageSize size;
                try (PdfPage page = doc.page(i)) {
                    size = page.size();
                }
                // Pretend bounds detection produced a centered crop.
                float cx = 20, cy = 20;
                float cw = size.width() - 40;
                float ch = size.height() - 40;
                float left = -cx, bottom = -cy;
                float right = cw - size.width() + cx;
                float top = ch - size.height() + cy;
                PdfMarginAdjuster.addMargins(doc, i, left, bottom, right, top);
                img.flush();
            }
            doc.saveBytes();
        }
    }

    private Stats bench(IoRunnable r) throws IOException {
        double sumMs = 0;
        double sumHeapMb = 0;
        for (int i = 0; i < RUNS; i++) {
            System.gc();
            long before = usedHeap();
            long t0 = System.nanoTime();
            r.run();
            long t1 = System.nanoTime();
            long after = usedHeap();
            sumMs += (t1 - t0) / 1_000_000.0;
            sumHeapMb += Math.max(0, after - before) / (1024.0 * 1024.0);
        }
        Stats s = new Stats();
        s.avgMillis = sumMs / RUNS;
        s.avgPeakHeapMb = sumHeapMb / RUNS;
        return s;
    }

    private static long usedHeap() {
        Runtime rt = Runtime.getRuntime();
        return rt.totalMemory() - rt.freeMemory();
    }

    // Image-heavy PDF: one JPEG per page so crop/scale touch real content.
    private static void buildImageHeavyPdf(Path path, int pages) throws IOException {
        byte[] jpeg = makeJpeg(IMG_W, IMG_H);
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                PDImageXObject img = PDImageXObject.createFromByteArray(doc, jpeg, "bg" + i);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(
                            img,
                            0,
                            0,
                            page.getMediaBox().getWidth(),
                            page.getMediaBox().getHeight());
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 18);
                    cs.newLineAtOffset(40, 40);
                    cs.showText("page " + i);
                    cs.endText();
                }
            }
            doc.save(path.toFile());
        }
    }

    private static byte[] makeJpeg(int w, int h) throws IOException {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        for (int y = 0; y < h; y += 8) {
            // Gradient so the encoded JPEG is not trivially compressible.
            g.setColor(new Color((y * 7) & 0xff, (y * 11) & 0xff, (y * 13) & 0xff));
            g.fillRect(0, y, w, 8);
        }
        g.dispose();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", baos);
        return baos.toByteArray();
    }

    private static class Stats {
        double avgMillis;
        double avgPeakHeapMb;
    }

    @FunctionalInterface
    private interface IoRunnable {
        void run() throws IOException;
    }
}
