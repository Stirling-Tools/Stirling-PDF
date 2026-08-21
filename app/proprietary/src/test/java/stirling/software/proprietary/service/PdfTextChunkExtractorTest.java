package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.api.ai.comments.TextChunk;

/**
 * Unit tests for {@link PdfTextChunkExtractor}. Exercises chunk id format, bounding-box validity,
 * multi-page extraction, the empty-PDF path, and the 2000-chunk cap.
 */
class PdfTextChunkExtractorTest {

    private static final Pattern CHUNK_ID_PATTERN = Pattern.compile("^p\\d+-c\\d+$");

    private final PdfTextChunkExtractor extractor = new PdfTextChunkExtractor();

    @Test
    void extractsOneChunkPerVisualLineWithValidBoundingBoxes() throws IOException {
        byte[] pdf = buildTwoPagePdf("Line A on page one", "Line B on page two");

        try (PDDocument doc = Loader.loadPDF(pdf)) {
            List<TextChunk> chunks = extractor.extract(doc);

            assertFalse(chunks.isEmpty(), "Extractor should produce at least one chunk");

            for (TextChunk chunk : chunks) {
                assertTrue(
                        CHUNK_ID_PATTERN.matcher(chunk.id()).matches(),
                        "Chunk id should match p{page}-c{idx}, got: " + chunk.id());
                assertTrue(chunk.width() > 0f, "width > 0, chunk=" + chunk);
                assertTrue(chunk.height() > 0f, "height > 0, chunk=" + chunk);
                assertFalse(chunk.text() == null || chunk.text().isBlank(), "text non-blank");

                PDRectangle box = doc.getPage(chunk.page()).getMediaBox();
                assertTrue(chunk.x() >= 0f, "x >= 0, chunk=" + chunk);
                assertTrue(chunk.y() >= 0f, "y >= 0, chunk=" + chunk);
                assertTrue(
                        chunk.x() + chunk.width() <= box.getWidth() + 0.01f,
                        "x + width fits within page width, chunk=" + chunk);
                assertTrue(
                        chunk.y() + chunk.height() <= box.getHeight() + 0.01f,
                        "y + height fits within page height, chunk=" + chunk);
            }

            assertTrue(
                    chunks.stream().anyMatch(c -> c.page() == 0 && c.text().contains("Line A")),
                    "Expected a page-0 chunk containing 'Line A'; chunks=" + chunks);
            assertTrue(
                    chunks.stream().anyMatch(c -> c.page() == 1 && c.text().contains("Line B")),
                    "Expected a page-1 chunk containing 'Line B'; chunks=" + chunks);
        }
    }

    @Test
    void returnsEmptyListForPdfWithNoExtractableText() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            byte[] pdf = baos.toByteArray();

            try (PDDocument loaded = Loader.loadPDF(pdf)) {
                List<TextChunk> chunks = extractor.extract(loaded);
                assertTrue(chunks.isEmpty(), "Expected no chunks, got=" + chunks);
            }
        }
    }

    @Test
    void enforcesHardCapOf2000Chunks() throws IOException {
        byte[] pdf = buildPdfWithManyLines(2500);

        try (PDDocument doc = Loader.loadPDF(pdf)) {
            List<TextChunk> chunks = extractor.extract(doc);
            assertEquals(
                    2000,
                    chunks.size(),
                    "Extractor should cap at MAX_CHUNKS_PER_DOC (2000); got=" + chunks.size());
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private static byte[] buildTwoPagePdf(String page1Text, String page2Text) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            addPageWithLine(doc, page1Text);
            addPageWithLine(doc, page2Text);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static void addPageWithLine(PDDocument doc, String text) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(72, 700);
            cs.showText(text);
            cs.endText();
        }
    }

    /**
     * Build a PDF with {@code totalLines} short lines of text spread across pages so the extractor
     * has to produce one chunk per line.
     */
    private static byte[] buildPdfWithManyLines(int totalLines) throws IOException {
        int linesPerPage = 50;
        try (PDDocument doc = new PDDocument()) {
            int remaining = totalLines;
            int lineCounter = 0;
            while (remaining > 0) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                    cs.beginText();
                    cs.newLineAtOffset(72, 780);
                    int toWrite = Math.min(linesPerPage, remaining);
                    for (int i = 0; i < toWrite; i++) {
                        cs.showText("line-" + lineCounter++);
                        if (i < toWrite - 1) {
                            cs.newLineAtOffset(0, -14);
                        }
                    }
                    cs.endText();
                }
                remaining -= linesPerPage;
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }
}
