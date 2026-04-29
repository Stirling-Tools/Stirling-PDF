package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.Optional;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.PdfTextLocator.MatchedBox;

class PdfTextLocatorTest {

    private final PdfTextLocator locator = new PdfTextLocator();

    @Test
    void findsLineContainingNeedleAndReturnsUserSpaceBox() throws Exception {
        byte[] pdf = pdfWithLines(new String[] {"Revenue: $215,000", "Expenses: $120,000"});
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            Optional<MatchedBox> match = locator.findOnPage(doc, 0, "215000");
            assertThat(match).isPresent();
            MatchedBox box = match.get();
            // Line was drawn at y=720 in user-space (bottom-left origin); locator
            // should return a bbox close to that height band with non-zero width.
            assertThat(box.width()).isGreaterThan(0f);
            assertThat(box.height()).isGreaterThan(0f);
            assertThat(box.y()).isBetween(700f, 740f);
        }
    }

    @Test
    void matchIsCaseAndPunctuationInsensitive() throws Exception {
        byte[] pdf = pdfWithLines(new String[] {"Total Revenue.", "Q4 summary"});
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            Optional<MatchedBox> match = locator.findOnPage(doc, 0, "total revenue");
            assertThat(match).isPresent();
        }
    }

    @Test
    void returnsEmptyWhenNeedleNotFound() throws Exception {
        byte[] pdf = pdfWithLines(new String[] {"Nothing to see here"});
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            Optional<MatchedBox> match = locator.findOnPage(doc, 0, "not-on-this-page");
            assertThat(match).isEmpty();
        }
    }

    @Test
    void returnsEmptyForBlankNeedle() throws Exception {
        byte[] pdf = pdfWithLines(new String[] {"Any text"});
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertThat(locator.findOnPage(doc, 0, "")).isEmpty();
            assertThat(locator.findOnPage(doc, 0, "   ")).isEmpty();
            assertThat(locator.findOnPage(doc, 0, null)).isEmpty();
        }
    }

    @Test
    void returnsEmptyForOutOfRangePage() throws Exception {
        byte[] pdf = pdfWithLines(new String[] {"Single page"});
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertThat(locator.findOnPage(doc, -1, "single")).isEmpty();
            assertThat(locator.findOnPage(doc, 99, "single")).isEmpty();
        }
    }

    private static byte[] pdfWithLines(String[] lines) throws Exception {
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
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }
}
