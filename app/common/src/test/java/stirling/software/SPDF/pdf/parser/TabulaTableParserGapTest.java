package stirling.software.SPDF.pdf.parser;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static stirling.software.SPDF.pdf.parser.PdfModels.RawPage;
import static stirling.software.SPDF.pdf.parser.PdfModels.TableCell;
import static stirling.software.SPDF.pdf.parser.PdfModels.TableFragment;
import static stirling.software.SPDF.pdf.parser.PdfModels.TableRow;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link TabulaTableParser}. Tables are built in-memory with PDFBox so the tests are
 * deterministic and need no fixtures, network, or external processes.
 */
class TabulaTableParserGapTest {

    private final TabulaTableParser parser = new TabulaTableParser();

    // ── error / empty branches ───────────────────────────────────────────────

    @Nested
    @DisplayName("Empty and error branches")
    class EmptyAndErrorBranches {

        @Test
        @DisplayName("page number 0 is out of Tabula's 1-based range -> empty list, no throw")
        void pageNumberZeroReturnsEmpty() throws Exception {
            byte[] pdf = pdfWithText(new String[] {"hello"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> result = parser.parse(doc, 0);
                assertNotNull(result);
                assertTrue(result.isEmpty());
            }
        }

        @Test
        @DisplayName("page number beyond the document -> empty list, exception swallowed")
        void pageNumberOutOfRangeReturnsEmpty() throws Exception {
            byte[] pdf = pdfWithText(new String[] {"hello"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> result = parser.parse(doc, 99);
                assertNotNull(result);
                assertTrue(result.isEmpty());
            }
        }

        @Test
        @DisplayName("negative page number -> empty list")
        void negativePageNumberReturnsEmpty() throws Exception {
            byte[] pdf = pdfWithText(new String[] {"hello"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertTrue(parser.parse(doc, -5).isEmpty());
            }
        }

        @Test
        @DisplayName("lattice mode on a page with no ruled lines -> no tables")
        void latticeWithNoRulingsReturnsEmpty() throws Exception {
            byte[] pdf = pdfWithText(new String[] {"just some prose", "no table here"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> result = parser.parse(doc, new RawPage(1, 0f, 0f, List.of()));
                assertNotNull(result);
                assertTrue(
                        result.isEmpty(), "borderless text must not be detected in lattice mode");
            }
        }

        @Test
        @DisplayName("blank page in lattice mode -> empty list")
        void blankPageLatticeReturnsEmpty() throws Exception {
            byte[] pdf = blankPdf();
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertTrue(parser.parse(doc, new RawPage(1, 0f, 0f, List.of())).isEmpty());
            }
        }
    }

    // ── stream mode (BasicExtractionAlgorithm) ───────────────────────────────

    @Nested
    @DisplayName("Stream mode")
    class StreamMode {

        @Test
        @DisplayName("page with text yields at least one well-formed fragment")
        void streamOnTextProducesFragment() throws Exception {
            byte[] pdf =
                    pdfWithText(new String[] {"Name Age City", "Alice 30 Paris", "Bob 25 Rome"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> fragments =
                        parser.parseStream(doc, new RawPage(1, 0f, 0f, List.of()));
                assertNotNull(fragments);
                assertFalse(fragments.isEmpty(), "stream mode always builds a table from text");
                assertFragmentWellFormed(fragments.get(0), 1, 0);
            }
        }

        @Test
        @DisplayName("fragment ids encode page and index")
        void streamFragmentIdFormat() throws Exception {
            byte[] pdf = pdfWithText(new String[] {"col1 col2", "a b"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> fragments =
                        parser.parseStream(doc, new RawPage(1, 0f, 0f, List.of()));
                assertFalse(fragments.isEmpty());
                assertEquals("tbl-p1-0", fragments.get(0).tableId());
                assertEquals(1, fragments.get(0).pageNumber());
            }
        }

        @Test
        @DisplayName("rawRows and the parsed rows stay in lockstep")
        void streamRowsMatchRawRows() throws Exception {
            byte[] pdf = pdfWithText(new String[] {"x y", "1 2", "3 4"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> fragments =
                        parser.parseStream(doc, new RawPage(1, 0f, 0f, List.of()));
                assertFalse(fragments.isEmpty());
                TableFragment f = fragments.get(0);
                assertEquals(f.rawRows().size(), f.rows().size());
            }
        }
    }

    // ── lattice mode with a real bordered grid ───────────────────────────────

    @Nested
    @DisplayName("Lattice mode")
    class LatticeMode {

        @Test
        @DisplayName("bordered grid is detected and produces well-formed fragments")
        void latticeDetectsBorderedTable() throws Exception {
            byte[] pdf = pdfWithGrid();
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> fragments =
                        parser.parse(doc, new RawPage(1, 0f, 0f, List.of()));
                assertNotNull(fragments);
                assertFalse(
                        fragments.isEmpty(), "a clean ruled grid must be detected in lattice mode");
                TableFragment f = fragments.get(0);
                assertFragmentWellFormed(f, 1, 0);
                assertTrue(f.columnCount() >= 1, "a detected grid must have at least one column");
                assertFalse(f.rawRows().isEmpty(), "a detected grid must have rows");
            }
        }

        @Test
        @DisplayName("convenience overload with page number routes to lattice mode")
        void parseByPageNumberDetectsGrid() throws Exception {
            byte[] pdf = pdfWithGrid();
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> fragments = parser.parse(doc, 1);
                assertNotNull(fragments);
                assertFalse(fragments.isEmpty());
                assertEquals(1, fragments.get(0).pageNumber());
            }
        }

        @Test
        @DisplayName("cell text is normalised (trimmed, newlines collapsed)")
        void latticeCellTextIsNormalised() throws Exception {
            byte[] pdf = pdfWithGrid();
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TableFragment> fragments =
                        parser.parse(doc, new RawPage(1, 0f, 0f, List.of()));
                assertFalse(fragments.isEmpty());
                for (List<String> row : fragments.get(0).rawRows()) {
                    for (String cell : row) {
                        assertNotNull(cell);
                        assertFalse(cell.contains("\n"), "newlines must be collapsed");
                        assertFalse(cell.contains("\r"), "carriage returns must be collapsed");
                        assertEquals(cell.trim(), cell, "cell text must be trimmed");
                    }
                }
            }
        }
    }

    // ── contract invariants ──────────────────────────────────────────────────

    @Nested
    @DisplayName("Contract invariants")
    class ContractInvariants {

        @Test
        @DisplayName("parse never returns null")
        void parseNeverReturnsNull() throws Exception {
            byte[] pdf = pdfWithText(new String[] {"abc"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertNotNull(parser.parse(doc, new RawPage(1, 0f, 0f, List.of())));
                assertNotNull(parser.parse(doc, 1));
                assertNotNull(parser.parseStream(doc, new RawPage(1, 0f, 0f, List.of())));
            }
        }

        @Test
        @DisplayName("the document is not closed by the parser")
        void documentRemainsOpenAfterParse() throws Exception {
            byte[] pdf = pdfWithText(new String[] {"keep me open"});
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                parser.parse(doc, new RawPage(1, 0f, 0f, List.of()));
                parser.parseStream(doc, new RawPage(1, 0f, 0f, List.of()));
                // ObjectExtractor.close() would close the underlying COSDocument; the parser must
                // not.
                assertFalse(
                        doc.getDocument().isClosed(),
                        "parser must not close the caller's document");
                assertEquals(1, doc.getNumberOfPages());
            }
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Asserts every field of a fragment satisfies the documented contract. */
    private static void assertFragmentWellFormed(
            TableFragment f, int expectedPage, int expectedIndex) {
        assertNotNull(f);
        assertEquals(expectedPage, f.pageNumber());
        assertEquals("tbl-p" + expectedPage + "-" + expectedIndex, f.tableId());
        assertNotNull(f.bounds());
        assertNotNull(f.headers());
        assertTrue(f.headers().isEmpty(), "headers are deferred to v2 and must be empty");
        assertNotNull(f.rows());
        assertNotNull(f.rawRows());
        assertNotNull(f.warnings());
        assertSame(null, f.continuedFromPage(), "continuedFromPage is deferred to v2");
        assertTrue(f.columnCount() >= 0);
        assertTrue(f.confidence() >= 0f && f.confidence() <= 1f, "confidence must be within [0,1]");
        assertEquals(f.rawRows().size(), f.rows().size());

        for (TableRow row : f.rows()) {
            assertNotNull(row.cells());
            for (TableCell cell : row.cells()) {
                assertNotNull(cell.text());
                assertNotNull(cell.bounds());
                assertEquals(1, cell.colSpan(), "colSpan is always 1 in v1");
                assertEquals(1, cell.rowSpan(), "rowSpan is always 1 in v1");
            }
        }
    }

    private static byte[] pdfWithText(String[] lines) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.setNonStrokingColor(Color.BLACK);
                float y = 720f;
                for (String line : lines) {
                    cs.beginText();
                    cs.newLineAtOffset(72f, y);
                    cs.showText(line);
                    cs.endText();
                    y -= 20f;
                }
            }
            return save(doc);
        }
    }

    private static byte[] blankPdf() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            return save(doc);
        }
    }

    /**
     * Builds a small 3-row x 3-column ruled grid with text in each cell. The ruled lines make the
     * table detectable by lattice mode.
     */
    private static byte[] pdfWithGrid() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);

            float left = 100f;
            float right = 400f;
            float top = 700f;
            float bottom = 550f;
            int cols = 3;
            int rows = 3;
            float colStep = (right - left) / cols;
            float rowStep = (top - bottom) / rows;

            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.setStrokingColor(Color.BLACK);
                cs.setLineWidth(1f);

                // vertical lines
                for (int c = 0; c <= cols; c++) {
                    float x = left + c * colStep;
                    cs.moveTo(x, bottom);
                    cs.lineTo(x, top);
                }
                // horizontal lines
                for (int r = 0; r <= rows; r++) {
                    float yLine = bottom + r * rowStep;
                    cs.moveTo(left, yLine);
                    cs.lineTo(right, yLine);
                }
                cs.stroke();

                // cell text
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                cs.setNonStrokingColor(Color.BLACK);
                for (int r = 0; r < rows; r++) {
                    for (int c = 0; c < cols; c++) {
                        cs.beginText();
                        cs.newLineAtOffset(left + c * colStep + 5f, top - (r + 1) * rowStep + 6f);
                        cs.showText("R" + r + "C" + c);
                        cs.endText();
                    }
                }
            }
            return save(doc);
        }
    }

    private static byte[] save(PDDocument doc) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }
}
