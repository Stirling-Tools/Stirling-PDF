package stirling.software.proprietary.pdf.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Regression tests for rewriter damage a validator cannot see, so it still passes validation. */
class MarkedContentSafetyTest {

    private static String contentOf(PDDocument document) throws IOException {
        try (InputStream in = document.getPage(0).getContents()) {
            return new String(in.readAllBytes(), StandardCharsets.ISO_8859_1);
        }
    }

    private static void setContent(PDDocument document, String content) throws IOException {
        PDStream stream = new PDStream(document);
        try (var out = stream.createOutputStream()) {
            out.write(content.getBytes(StandardCharsets.ISO_8859_1));
        }
        document.getPage(0).setContents(stream);
    }

    private static PDDocument onePage() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(50, 700);
            cs.showText("visible");
            cs.endText();
        }
        return document;
    }

    @Test
    @DisplayName("an optional-content layer survives the rebuild, so hidden content stays hidden")
    void optionalContentIsPreserved() throws Exception {
        try (PDDocument document = onePage()) {
            String original = contentOf(document);
            setContent(document, "/OC /MC0 BDC\n" + original + "\nEMC\n");

            StructBlock paragraph = new StructBlock(StructType.P, 0);
            paragraph.addRange(0, 0);
            new MarkedContentInjector()
                    .inject(document, document.getPage(0), List.of(paragraph), 0, true);

            String rewritten = contentOf(document);
            assertTrue(
                    rewritten.contains("/OC"),
                    "the optional-content wrapper was stripped, which would make a hidden"
                            + " DRAFT/CONFIDENTIAL or redaction layer permanently visible:\n"
                            + rewritten);
            assertEquals(
                    countOf(rewritten, "BDC") + countOf(rewritten, "BMC"),
                    countOf(rewritten, "EMC"),
                    "marked content is unbalanced after preserving the layer");
        }
    }

    @Test
    @DisplayName("replacement text survives the rebuild so ligatures still read correctly")
    void actualTextIsPreserved() throws Exception {
        try (PDDocument document = onePage()) {
            String original = contentOf(document);
            // A generator marks an ffi ligature with what it really spells.
            setContent(
                    document, "/Span <</ActualText (ffi) /MCID 7>> BDC\n" + original + "\nEMC\n");

            StructBlock paragraph = new StructBlock(StructType.P, 0);
            paragraph.addRange(0, 0);
            new MarkedContentInjector()
                    .inject(document, document.getPage(0), List.of(paragraph), 0, true);

            String rewritten = contentOf(document);
            assertTrue(
                    rewritten.contains("ActualText"),
                    "dropping ActualText leaves a screen reader announcing the raw glyph:\n"
                            + rewritten);
            assertFalse(
                    rewritten.contains("/MCID 7"),
                    "the source's own marked content id is meaningless after a rebuild");
            assertEquals(
                    countOf(rewritten, "BDC") + countOf(rewritten, "BMC"),
                    countOf(rewritten, "EMC"),
                    "marked content is unbalanced after preserving replacement text");
        }
    }

    @Test
    @DisplayName("a sequence wrapping a fill opens before the path, not inside it")
    void markedContentNeverOpensInsideAPathObject() throws Exception {
        try (PDDocument document = onePage()) {
            setContent(document, "0 0 0 rg\n10 10 50 5 re\nf\n");

            new MarkedContentInjector().inject(document, document.getPage(0), List.of(), 0, true);

            String rewritten = contentOf(document);
            int reAt = rewritten.indexOf(" re");
            int openAt = Math.max(rewritten.indexOf("BMC"), rewritten.indexOf("BDC"));
            assertTrue(openAt >= 0, "no sequence was opened at all: " + rewritten);
            assertTrue(
                    openAt < reAt,
                    "ISO 32000-1 does not permit a marked-content operator inside a path object;"
                            + " the sequence must open before the path construction:\n"
                            + rewritten);
        }
    }

    @Test
    @DisplayName("words drawn out of stream order are still claimed, not silently artifacted")
    void outOfOrderWordsAreClaimed() {
        // A line whose second word on the page was painted first: ordinals 1 then 0.
        WordInfo right = new WordInfo("label", new BBox(50, 700, 90, 712), 1, 1, 11, false);
        WordInfo left = new WordInfo("value", new BBox(200, 700, 240, 712), 0, 0, 11, false);
        TextLineInfo line =
                new TextLineInfo(
                        0,
                        "label value",
                        new BBox(50, 700, 240, 712),
                        11,
                        false,
                        0,
                        1,
                        false,
                        List.of(right, left));

        PageContent page =
                new PageContent(
                        0,
                        List.of(line),
                        List.of(),
                        2,
                        false,
                        false,
                        false,
                        new BBox(0, 0, 595, 842));
        DocumentStructure structure = new LayoutAnalyzer().analyse(List.of(page));

        boolean[] claimed = new boolean[2];
        structure.visit(
                block -> {
                    if (block.isArtifact()) {
                        return;
                    }
                    block.getRanges()
                            .forEach(
                                    r -> {
                                        for (int i = r.start(); i <= r.end() && i < 2; i++) {
                                            claimed[i] = true;
                                        }
                                    });
                });
        assertTrue(
                claimed[0] && claimed[1],
                "an out-of-order word was left unclaimed and would be hidden from assistive"
                        + " technology while the file still validated");
    }

    private static int countOf(String haystack, String needle) {
        int total = 0;
        int index = 0;
        while ((index = haystack.indexOf(needle, index)) >= 0) {
            total++;
            index += needle.length();
        }
        return total;
    }

    private static byte[] bytes(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return out.toByteArray();
    }
}
