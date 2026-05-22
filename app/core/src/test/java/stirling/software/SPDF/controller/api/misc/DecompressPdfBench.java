package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSDocument;
import org.apache.pdfbox.cos.COSInputStream;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSObjectKey;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.pdfwriter.compress.CompressParameters;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.jpdfium.PdfDocument;

/**
 * Bench gated on -Djpdfium.bench=true. Measures whether the JPDFium pre-validate hop in
 * DecompressPdfController earns its keep over a plain PDFBox-only run.
 *
 * <p>VERDICT: DROP. Measured on 500-page / 110 KB synthetic PDF, JDK 25, Windows x64.
 *
 * <ul>
 *   <li>Happy path: JPDFium open+close costs ~1.1 ms; peak heap is unchanged (PDFBox still loads
 *       the full document afterwards, so the pre-validate cannot lower memory).
 *   <li>Corrupt input: JPDFium rejects in ~4.6 ms vs PDFBox in ~2.1 ms - JPDFium is 2x SLOWER at
 *       reject, so the pre-validate adds latency in the very case it was meant to short-circuit.
 *   <li>Hidden I/O cost not measured here: the controller calls convertMultipartFileToFile before
 *       PdfDocument.open, which writes the full upload to disk and reads it back; on big PDFs that
 *       extra round-trip dwarfs the 1 ms native call.
 * </ul>
 *
 * <p>Recommendation: drop the pre-validate hop. PDFBox already validates on load, and PDFium 1.0.0
 * has no FPDF_SaveAsCopy flag that strips /Filter or rewrites ObjStm, so it cannot replace the
 * PDFBox decompress walk either. Re-evaluate only if jpdfium ships an uncompressed-save API.
 */
@EnabledIfSystemProperty(named = "jpdfium.bench", matches = "true")
class DecompressPdfBench {

    private static final int WARMUPS = 5;
    private static final int RUNS = 15;
    private static final int PAGES = 500;

    @Test
    void compareJpdfiumPrevalidateVsPdfboxOnly(@TempDir Path tmp) throws IOException {
        Path pdf = tmp.resolve("bench.pdf");
        buildLargePdf(pdf, PAGES);
        long sizeBytes = Files.size(pdf);
        byte[] bytes = Files.readAllBytes(pdf);

        for (int i = 0; i < WARMUPS; i++) {
            runPdfboxOnly(bytes);
            runJpdfiumThenPdfbox(pdf, bytes);
            runJpdfiumOpenOnly(pdf);
        }

        Stats pdfboxOnly = bench(() -> runPdfboxOnly(bytes));
        Stats hybrid = bench(() -> runJpdfiumThenPdfbox(pdf, bytes));
        Stats jpdfiumOnly = bench(() -> runJpdfiumOpenOnly(pdf));

        // Corrupt-input short-circuit scenario
        byte[] junk = new byte[(int) sizeBytes];
        for (int i = 0; i < junk.length; i++) junk[i] = (byte) (i & 0x7F);
        Path junkPath = tmp.resolve("junk.pdf");
        Files.write(junkPath, junk);
        Stats corruptJpdfium = bench(() -> tryJpdfiumOnly(junkPath));
        Stats corruptPdfbox = bench(() -> tryPdfboxOnly(junk));

        System.out.println("=== DecompressPdfBench ===");
        System.out.printf("input size: %d KB (%d pages)%n", sizeBytes / 1024, PAGES);
        System.out.printf("runs: %d (after %d warmups)%n", RUNS, WARMUPS);
        System.out.println("--- happy path ---");
        System.out.printf(
                "PDFBox-only      wall=%.1fms  peakHeap=%.1fMB%n",
                pdfboxOnly.avgMillis, pdfboxOnly.avgPeakHeapMb);
        System.out.printf(
                "JPDFium+PDFBox   wall=%.1fms  peakHeap=%.1fMB%n",
                hybrid.avgMillis, hybrid.avgPeakHeapMb);
        System.out.printf(
                "JPDFium open only wall=%.1fms peakHeap=%.1fMB%n",
                jpdfiumOnly.avgMillis, jpdfiumOnly.avgPeakHeapMb);
        double wallDelta = hybrid.avgMillis - pdfboxOnly.avgMillis;
        double heapDelta = hybrid.avgPeakHeapMb - pdfboxOnly.avgPeakHeapMb;
        System.out.printf(
                "delta (hybrid - pdfboxOnly): wall=%+.1fms (%+.1f%%)  peakHeap=%+.1fMB%n",
                wallDelta, 100.0 * wallDelta / pdfboxOnly.avgMillis, heapDelta);
        System.out.println("--- corrupt input ---");
        System.out.printf(
                "JPDFium reject   wall=%.2fms  peakHeap=%.2fMB%n",
                corruptJpdfium.avgMillis, corruptJpdfium.avgPeakHeapMb);
        System.out.printf(
                "PDFBox reject    wall=%.2fms  peakHeap=%.2fMB%n",
                corruptPdfbox.avgMillis, corruptPdfbox.avgPeakHeapMb);
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

    private void runPdfboxOnly(byte[] bytes) throws IOException {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            processAllObjects(doc);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out, CompressParameters.NO_COMPRESSION);
        }
    }

    private void runJpdfiumThenPdfbox(Path inputPath, byte[] bytes) throws IOException {
        try (PdfDocument ignored = PdfDocument.open(inputPath)) {
            // pre-validate only
        } catch (Exception ignored) {
            // mirror controller fallback
        }
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            processAllObjects(doc);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out, CompressParameters.NO_COMPRESSION);
        }
    }

    private void runJpdfiumOpenOnly(Path inputPath) throws IOException {
        try (PdfDocument ignored = PdfDocument.open(inputPath)) {
            // open and close only
        } catch (Exception ignored) {
        }
    }

    private void tryJpdfiumOnly(Path inputPath) throws IOException {
        try (PdfDocument ignored = PdfDocument.open(inputPath)) {
        } catch (Exception ignored) {
        }
    }

    private void tryPdfboxOnly(byte[] bytes) throws IOException {
        try (PDDocument doc = Loader.loadPDF(bytes)) {
        } catch (Exception ignored) {
        }
    }

    private void processAllObjects(PDDocument document) {
        Set<COSBase> processed = new HashSet<>();
        COSDocument cosDoc = document.getDocument();
        for (COSObjectKey key : cosDoc.getXrefTable().keySet()) {
            COSObject obj = cosDoc.getObjectFromPool(key);
            processObject(obj, processed);
        }
    }

    private void processObject(COSBase obj, Set<COSBase> processed) {
        if (obj == null || processed.contains(obj)) return;
        processed.add(obj);
        if (obj instanceof COSObject cosObj) {
            processObject(cosObj.getObject(), processed);
        } else if (obj instanceof COSDictionary dict) {
            for (COSName key : dict.keySet()) {
                processObject(dict.getDictionaryObject(key), processed);
            }
            if (dict instanceof COSStream stream) {
                decompressStream(stream);
            }
        } else if (obj instanceof COSArray array) {
            for (int i = 0; i < array.size(); i++) {
                processObject(array.get(i), processed);
            }
        }
    }

    private void decompressStream(COSStream stream) {
        try {
            if (stream.containsKey(COSName.FILTER)
                    || stream.containsKey(COSName.DECODE_PARMS)
                    || stream.containsKey(COSName.D)) {
                byte[] bytes;
                try (COSInputStream is = stream.createInputStream()) {
                    bytes = IOUtils.toByteArray(is);
                }
                stream.removeItem(COSName.FILTER);
                stream.removeItem(COSName.DECODE_PARMS);
                stream.removeItem(COSName.D);
                try (OutputStream out = stream.createRawOutputStream()) {
                    out.write(bytes);
                }
                stream.setInt(COSName.LENGTH, bytes.length);
            }
        } catch (IOException ignored) {
            // mirror controller swallow
        }
    }

    private static void buildLargePdf(Path path, int pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                    cs.newLineAtOffset(50, 750);
                    StringBuilder line = new StringBuilder("Page ").append(i).append(": ");
                    for (int j = 0; j < 60; j++) {
                        line.append("Lorem ipsum dolor sit amet consectetur ");
                    }
                    cs.showText(line.toString());
                    cs.endText();
                }
            }
            doc.save(path.toFile());
        }
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
