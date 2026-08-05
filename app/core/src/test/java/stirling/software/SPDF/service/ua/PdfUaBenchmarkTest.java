package stirling.software.SPDF.service.ua;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.pdf.ua.DocumentStructure;
import stirling.software.common.pdf.ua.LayoutAnalyzer;
import stirling.software.common.pdf.ua.PageContent;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.pdf.ua.PdfUaTagger;
import stirling.software.common.pdf.ua.TaggedContentExtractor;
import stirling.software.common.pdf.ua.TaggingOptions;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/**
 * Measures where conversion time and memory go; meant to be read, not to gate CI. Assertions catch
 * only order-of-magnitude regressions - wall-clock numbers are no contract.
 */
class PdfUaBenchmarkTest {

    private static PdfUaConversionService service;
    private static PdfUaValidationService validation;

    @BeforeAll
    static void setUp() {
        validation = new PdfUaValidationService();
        validation.initialise();
        service =
                new PdfUaConversionService(
                        validation,
                        new FontEmbeddingService(),
                        new CustomPDFDocumentFactory(
                                org.mockito.Mockito.mock(PdfMetadataService.class)));
    }

    /** A realistic page: heading, prose, a small table, a bullet list. */
    private static byte[] document(int pages) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDFont font = null;
            for (int p = 0; p < pages; p++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                if (font == null) {
                    try (InputStream in =
                            PdfUaBenchmarkTest.class.getResourceAsStream(
                                    "/static/fonts/DejaVuSans.ttf")) {
                        font = PDType0Font.load(document, in, true);
                    }
                }
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    float y = 790;
                    write(cs, font, 9, 60, 810, "Benchmark Corpus Running Head");
                    write(cs, font, 18, 60, y, "Section " + (p + 1));
                    y -= 30;
                    for (int line = 0; line < 22; line++) {
                        write(
                                cs,
                                font,
                                11,
                                60,
                                y,
                                "Body line " + line + " of section " + (p + 1) + " with prose.");
                        y -= 15;
                    }
                    for (int row = 0; row < 4; row++) {
                        cs.beginText();
                        cs.setFont(font, 11);
                        cs.newLineAtOffset(60, y);
                        cs.showText("Row " + row);
                        cs.newLineAtOffset(160, 0);
                        cs.showText(String.valueOf(row * 120));
                        cs.newLineAtOffset(140, 0);
                        cs.showText(String.valueOf(row * 480));
                        cs.endText();
                        y -= 16;
                    }
                    write(cs, font, 11, 60, y - 10, "• First bullet point");
                    write(cs, font, 11, 60, y - 25, "• Second bullet point");
                    write(cs, font, 9, 300, 30, "Page " + (p + 1));
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private static void write(
            PDPageContentStream cs, PDFont font, float size, float x, float y, String text)
            throws IOException {
        cs.beginText();
        cs.setFont(font, size);
        cs.newLineAtOffset(x, y);
        cs.showText(text);
        cs.endText();
    }

    private static TaggingOptions options() {
        return TaggingOptions.builder()
                .profile(PdfUaProfile.UA1)
                .language("en-GB")
                .title("Benchmark")
                .embedFonts(false)
                .existingTags(TaggingOptions.ExistingTags.REBUILD)
                .build();
    }

    private static long usedHeap() {
        Runtime runtime = Runtime.getRuntime();
        System.gc();
        return runtime.totalMemory() - runtime.freeMemory();
    }

    @Test
    @DisplayName("reports throughput and memory across document sizes")
    void throughputAcrossSizes() throws Exception {
        int[] sizes = {1, 10, 50, 150};
        StringBuilder report =
                new StringBuilder("\nPDF/UA conversion throughput\n")
                        .append(
                                String.format(
                                        "  %-7s %-10s %-12s %-12s %-10s %s%n",
                                        "pages",
                                        "input",
                                        "convert ms",
                                        "ms/page",
                                        "pages/s",
                                        "heap MB"));

        // Warm up so the first timed run is not measuring class loading and JIT.
        service.convert(document(5), options());

        for (int pages : sizes) {
            byte[] input = document(pages);
            long heapBefore = usedHeap();
            long start = System.nanoTime();
            var outcome = service.convert(input, options());
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            long heapDelta = (usedHeap() - heapBefore) / (1024 * 1024);

            assertTrue(outcome.pdfBytes().length > 0);
            report.append(
                    String.format(
                            Locale.ROOT,
                            "  %-7d %-10s %-12d %-12.2f %-10.1f %d%n",
                            pages,
                            humanBytes(input.length),
                            elapsedMs,
                            elapsedMs / (double) pages,
                            pages * 1000.0 / Math.max(elapsedMs, 1),
                            Math.max(heapDelta, 0)));
        }
        System.out.println(report);
    }

    @Test
    @DisplayName("breaks conversion down by phase so optimisation has a target")
    void phaseBreakdown() throws Exception {
        byte[] input = document(60);

        // Warm up.
        try (PDDocument warm = Loader.loadPDF(input)) {
            new TaggedContentExtractor().extract(warm);
        }

        long parseMs;
        long extractMs;
        long analyseMs;
        long tagMs;
        List<PageContent> pages;
        DocumentStructure structure;

        long t0 = System.nanoTime();
        try (PDDocument document = Loader.loadPDF(input)) {
            parseMs = ms(t0);

            long t1 = System.nanoTime();
            pages = new TaggedContentExtractor().extract(document);
            extractMs = ms(t1);

            long t2 = System.nanoTime();
            structure = new LayoutAnalyzer().analyse(pages);
            analyseMs = ms(t2);
        }

        long t3 = System.nanoTime();
        try (PDDocument document = Loader.loadPDF(input)) {
            new PdfUaTagger().tag(document, options());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
        }
        tagMs = ms(t3);

        long t4 = System.nanoTime();
        var outcome = service.convert(input, options());
        long totalMs = ms(t4);

        long t5 = System.nanoTime();
        validation.validate(outcome.pdfBytes(), PdfUaProfile.UA1);
        long validateMs = ms(t5);

        System.out.printf(
                Locale.ROOT,
                "%nPhase breakdown over %d pages (%d blocks)%n"
                        + "  parse           %5d ms%n"
                        + "  extract         %5d ms   (text pass + token scan)%n"
                        + "  analyse         %5d ms%n"
                        + "  tag end-to-end  %5d ms   (includes parse, extract, analyse, inject, write)%n"
                        + "  validate        %5d ms   (veraPDF)%n"
                        + "  full convert    %5d ms   (tag + declare + validate)%n",
                60,
                structure.getBlocks().size(),
                parseMs,
                extractMs,
                analyseMs,
                tagMs,
                validateMs,
                totalMs);

        assertTrue(pages.size() == 60, "extractor lost pages");
    }

    @Test
    @DisplayName("splits the tagging pass into its own sub-phases")
    void taggingSubPhases() throws Exception {
        byte[] input = document(60);
        try (PDDocument warm = Loader.loadPDF(input)) {
            new TaggedContentExtractor().extract(warm);
        }

        long extractMs;
        long analyseMs;
        long injectMs;
        long treeMs;
        long saveMs;

        try (PDDocument document = Loader.loadPDF(input)) {
            long t = System.nanoTime();
            List<PageContent> pages = new TaggedContentExtractor().extract(document);
            extractMs = ms(t);

            t = System.nanoTime();
            DocumentStructure structure = new LayoutAnalyzer().analyse(pages);
            analyseMs = ms(t);

            t = System.nanoTime();
            var injector = new stirling.software.common.pdf.ua.MarkedContentInjector();
            var byPage =
                    new java.util.LinkedHashMap<
                            Integer, List<stirling.software.common.pdf.ua.StructBlock>>();
            structure
                    .getBlocks()
                    .forEach(
                            b ->
                                    byPage.computeIfAbsent(b.getPageIndex(), k -> new ArrayList<>())
                                            .add(b));
            for (int p = 0; p < document.getNumberOfPages(); p++) {
                injector.inject(
                        document, document.getPage(p), byPage.getOrDefault(p, List.of()), 0, true);
            }
            injectMs = ms(t);

            t = System.nanoTime();
            new stirling.software.common.pdf.ua.StructTreeWriter()
                    .write(document, structure, PdfUaProfile.UA1);
            treeMs = ms(t);

            t = System.nanoTime();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            saveMs = ms(t);
        }

        System.out.printf(
                Locale.ROOT,
                "%nTagging sub-phases over 60 pages%n"
                        + "  extract       %5d ms%n"
                        + "  analyse       %5d ms%n"
                        + "  inject        %5d ms%n"
                        + "  struct tree   %5d ms%n"
                        + "  save          %5d ms%n",
                extractMs,
                analyseMs,
                injectMs,
                treeMs,
                saveMs);
    }

    @Test
    @DisplayName("memory stays proportional to document size, not quadratic")
    void memoryScales() throws Exception {
        List<String> rows = new ArrayList<>();
        long previousPerPage = 0;
        boolean blewUp = false;

        for (int pages : new int[] {20, 80, 200}) {
            byte[] input = document(pages);
            long before = usedHeap();
            var outcome = service.convert(input, options());
            long after = usedHeap();
            long perPageKb = Math.max(after - before, 0) / 1024 / pages;
            rows.add(
                    String.format(
                            Locale.ROOT,
                            "  %-6d pages  in %-9s out %-9s  ~%d KB/page retained",
                            pages,
                            humanBytes(input.length),
                            humanBytes(outcome.pdfBytes().length),
                            perPageKb));
            // Per-page cost should stay roughly flat; a big jump means something accumulates.
            if (previousPerPage > 0 && perPageKb > previousPerPage * 4 && perPageKb > 200) {
                blewUp = true;
            }
            previousPerPage = Math.max(perPageKb, 1);
        }
        System.out.println("\nMemory scaling\n" + String.join("\n", rows));
        assertTrue(!blewUp, "per-page memory grew superlinearly: " + rows);
    }

    private static long ms(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000;
    }

    private static String humanBytes(int bytes) {
        return bytes < 1024 * 1024
                ? (bytes / 1024) + " KB"
                : String.format(Locale.ROOT, "%.1f MB", bytes / 1024.0 / 1024.0);
    }
}
