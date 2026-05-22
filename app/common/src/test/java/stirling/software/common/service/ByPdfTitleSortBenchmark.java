package stirling.software.common.service;

import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.jpdfium.doc.MetadataTag;

/**
 * Bench comparing byPDFTitle sort: PDFBox-load (pre-migration) vs JPDFium infoTagFast (post).
 * Disabled in CI; remove @Disabled locally to run. Numbers captured in audit report.
 */
@Disabled("Manual benchmark only")
class ByPdfTitleSortBenchmark {

    private static final int FILE_COUNT = 8;
    private static final int WARMUP = 2;
    private static final int ITERATIONS = 5;

    @Test
    void benchByPdfTitleSort(@TempDir Path tmp) throws IOException {
        CustomPDFDocumentFactory factory =
                new CustomPDFDocumentFactory(mock(PdfMetadataService.class));

        // Load larger PDF for realistic numbers (falls back to bundled example.pdf)
        byte[] base;
        Path bigPdf = Path.of("..", "..", "frontend", "public", "samples", "Sample.pdf");
        if (java.nio.file.Files.isReadable(bigPdf)) {
            base = java.nio.file.Files.readAllBytes(bigPdf);
        } else {
            try (InputStream in = getClass().getResourceAsStream("/example.pdf")) {
                if (in == null) throw new IOException("example.pdf missing");
                base = in.readAllBytes();
            }
        }
        System.out.println("Base PDF size: " + base.length + " bytes");

        // Create FILE_COUNT clones with varied Info.Title via PDFBox
        MultipartFile[] files = new MultipartFile[FILE_COUNT];
        for (int i = 0; i < FILE_COUNT; i++) {
            try (PDDocument doc = Loader.loadPDF(base)) {
                PDDocumentInformation info = doc.getDocumentInformation();
                if (info == null) info = new PDDocumentInformation();
                info.setTitle("title-" + (FILE_COUNT - i));
                doc.setDocumentInformation(info);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                doc.save(out);
                files[i] =
                        new MockMultipartFile(
                                "file" + i,
                                "file-" + i + ".pdf",
                                "application/pdf",
                                out.toByteArray());
            }
        }

        // Comparator: PDFBox-load (pre-migration)
        Comparator<MultipartFile> preCmp =
                (f1, f2) -> {
                    try (PDDocument d1 = factory.load(f1);
                            PDDocument d2 = factory.load(f2)) {
                        String t1 =
                                d1.getDocumentInformation() != null
                                        ? d1.getDocumentInformation().getTitle()
                                        : null;
                        String t2 =
                                d2.getDocumentInformation() != null
                                        ? d2.getDocumentInformation().getTitle()
                                        : null;
                        if (t1 == null && t2 == null) return 0;
                        if (t1 == null) return 1;
                        if (t2 == null) return -1;
                        return t1.compareToIgnoreCase(t2);
                    } catch (IOException e) {
                        return 0;
                    }
                };

        // Comparator: JPDFium infoTagFast (post-migration)
        Comparator<MultipartFile> postCmp =
                (f1, f2) -> {
                    try {
                        String t1 = factory.infoTagFast(f1, MetadataTag.TITLE).orElse(null);
                        String t2 = factory.infoTagFast(f2, MetadataTag.TITLE).orElse(null);
                        if (t1 == null && t2 == null) return 0;
                        if (t1 == null) return 1;
                        if (t2 == null) return -1;
                        return t1.compareToIgnoreCase(t2);
                    } catch (IOException e) {
                        return 0;
                    }
                };

        // Warmup
        for (int w = 0; w < WARMUP; w++) {
            MultipartFile[] copy = files.clone();
            Arrays.sort(copy, preCmp);
            MultipartFile[] copy2 = files.clone();
            Arrays.sort(copy2, postCmp);
        }

        // Bench: pre
        long prePeakHeap = 0;
        long preTotalMs = 0;
        for (int it = 0; it < ITERATIONS; it++) {
            System.gc();
            sleep(50);
            long heapBefore = usedHeap();
            long t0 = System.nanoTime();
            MultipartFile[] copy = files.clone();
            Arrays.sort(copy, preCmp);
            long t1 = System.nanoTime();
            long heapAfter = usedHeap();
            long delta = Math.max(0, heapAfter - heapBefore);
            prePeakHeap = Math.max(prePeakHeap, delta);
            preTotalMs += (t1 - t0) / 1_000_000;
        }

        // Bench: post
        long postPeakHeap = 0;
        long postTotalMs = 0;
        for (int it = 0; it < ITERATIONS; it++) {
            System.gc();
            sleep(50);
            long heapBefore = usedHeap();
            long t0 = System.nanoTime();
            MultipartFile[] copy = files.clone();
            Arrays.sort(copy, postCmp);
            long t1 = System.nanoTime();
            long heapAfter = usedHeap();
            long delta = Math.max(0, heapAfter - heapBefore);
            postPeakHeap = Math.max(postPeakHeap, delta);
            postTotalMs += (t1 - t0) / 1_000_000;
        }

        System.out.println(
                "=== byPDFTitle sort benchmark ("
                        + FILE_COUNT
                        + " files, "
                        + ITERATIONS
                        + " iters) ===");
        System.out.println(
                "PRE  (PDFBox load)    : "
                        + preTotalMs
                        + " ms total, peak heap delta "
                        + prePeakHeap / 1024
                        + " KB");
        System.out.println(
                "POST (JPDFium fast)   : "
                        + postTotalMs
                        + " ms total, peak heap delta "
                        + postPeakHeap / 1024
                        + " KB");
        System.out.println(
                "Wall speedup          : "
                        + String.format("%.2fx", (double) preTotalMs / Math.max(1, postTotalMs)));
        if (postPeakHeap > 0) {
            System.out.println(
                    "Heap reduction        : "
                            + String.format("%.2fx", (double) prePeakHeap / postPeakHeap));
        }
    }

    private static long usedHeap() {
        Runtime r = Runtime.getRuntime();
        return r.totalMemory() - r.freeMemory();
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
