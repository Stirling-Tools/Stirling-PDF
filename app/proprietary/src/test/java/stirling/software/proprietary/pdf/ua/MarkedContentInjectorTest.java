package stirling.software.proprietary.pdf.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Tests the content-stream rewriting that makes tagging possible. */
class MarkedContentInjectorTest {

    private static byte[] threeLinePdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                for (int i = 0; i < 3; i++) {
                    cs.beginText();
                    cs.setFont(font, 12);
                    cs.newLineAtOffset(50, 700 - i * 20);
                    cs.showText("Line " + i);
                    cs.endText();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private static String contentOf(PDDocument document) throws IOException {
        try (InputStream in = document.getPage(0).getContents()) {
            return new String(in.readAllBytes(), StandardCharsets.ISO_8859_1);
        }
    }

    @Test
    @DisplayName("wraps claimed content in BDC/EMC with a marked content id")
    void wrapsClaimedContent() throws Exception {
        try (PDDocument document = Loader.loadPDF(threeLinePdf())) {
            StructBlock paragraph = new StructBlock(StructType.P, 0);
            paragraph.addRange(0, 1);

            int next =
                    new MarkedContentInjector()
                            .inject(document, document.getPage(0), List.of(paragraph), 0, true);

            String content = contentOf(document);
            assertTrue(content.contains("/P"), "the structure type was not written");
            assertTrue(content.contains("/MCID"), "no marked content id was written");
            assertTrue(content.contains("BDC"), "no marked content sequence was opened");
            assertTrue(content.contains("EMC"), "no marked content sequence was closed");
            assertFalse(paragraph.getMcids().isEmpty(), "the block was given no marked content id");
            assertTrue(next > 0, "the id counter did not advance");
        }
    }

    @Test
    @DisplayName("marks unclaimed content as an artifact so nothing is left untagged")
    void unclaimedContentBecomesArtifact() throws Exception {
        try (PDDocument document = Loader.loadPDF(threeLinePdf())) {
            StructBlock paragraph = new StructBlock(StructType.P, 0);
            paragraph.addRange(0, 0);

            new MarkedContentInjector()
                    .inject(document, document.getPage(0), List.of(paragraph), 0, true);

            String content = contentOf(document);
            assertTrue(
                    content.contains("/Artifact"),
                    "content nobody claimed must be marked as an artifact, or PDF/UA clause 7.1"
                            + " fails");
        }
    }

    @Test
    @DisplayName("opens and closes sequences in balanced pairs")
    void sequencesAreBalanced() throws Exception {
        try (PDDocument document = Loader.loadPDF(threeLinePdf())) {
            StructBlock first = new StructBlock(StructType.P, 0);
            first.addRange(0, 0);
            StructBlock second = new StructBlock(StructType.H1, 0);
            second.addRange(2, 2);

            new MarkedContentInjector()
                    .inject(document, document.getPage(0), List.of(first, second), 0, true);

            String content = contentOf(document);
            int opens = count(content, "BDC") + count(content, "BMC");
            int closes = count(content, "EMC");
            assertEquals(opens, closes, "every opened sequence must be closed");
        }
    }

    @Test
    @DisplayName("rewriting does not change what a reader extracts")
    void textIsUnchanged() throws Exception {
        byte[] original = threeLinePdf();
        String before = extract(original);

        byte[] rewritten;
        try (PDDocument document = Loader.loadPDF(original)) {
            StructBlock paragraph = new StructBlock(StructType.P, 0);
            paragraph.addRange(0, 2);
            new MarkedContentInjector()
                    .inject(document, document.getPage(0), List.of(paragraph), 0, true);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            rewritten = out.toByteArray();
        }
        assertEquals(before, extract(rewritten), "marked content operators must not render");
    }

    @Test
    @DisplayName("two blocks claiming the same content keep the first, not both")
    void overlappingClaimsAreResolved() {
        StructBlock first = new StructBlock(StructType.P, 0);
        first.addRange(0, 2);
        StructBlock second = new StructBlock(StructType.H1, 0);
        second.addRange(1, 1);

        Map<Integer, StructBlock> owners =
                MarkedContentInjector.ownersByOrdinal(List.of(first, second));
        assertSame(first, owners.get(1), "the first claim wins so reading order stays unambiguous");
        assertEquals(3, owners.size());
    }

    private static int count(String haystack, String needle) {
        int total = 0;
        int index = 0;
        while ((index = haystack.indexOf(needle, index)) >= 0) {
            total++;
            index += needle.length();
        }
        return total;
    }

    private static String extract(byte[] pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            return new org.apache.pdfbox.text.PDFTextStripper()
                    .getText(document)
                    .replaceAll("\\s+", " ")
                    .strip();
        }
    }
}
