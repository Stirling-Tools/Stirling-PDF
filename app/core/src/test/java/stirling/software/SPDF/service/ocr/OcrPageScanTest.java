package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.OptionalInt;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.Test;

class OcrPageScanTest {

    private static final float W = PDRectangle.LETTER.getWidth();
    private static final float H = PDRectangle.LETTER.getHeight();

    @Test
    void fullPageScanReportsItsOwnDpi() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = page(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(image(doc, 850, 1100), 0, 0, W, H);
            }
            assertEquals(OptionalInt.of(100), OcrPageScan.scanDpi(page));
        }
    }

    @Test
    void stripsThatFillThePageTogetherCount() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = page(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(image(doc, 1700, 1100), 0, 0, W, H / 2);
                cs.drawImage(image(doc, 1700, 1100), 0, H / 2, W, H / 2);
            }
            assertEquals(OptionalInt.of(200), OcrPageScan.scanDpi(page));
        }
    }

    @Test
    void aScanTurnedSidewaysMeasuresTheSame() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = page(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.transform(new Matrix(0, 1, -1, 0, W, 0));
                cs.drawImage(image(doc, 1100, 850), 0, 0, H, W);
            }
            assertEquals(OptionalInt.of(100), OcrPageScan.scanDpi(page));
        }
    }

    @Test
    void anEarlierInvisibleOcrLayerStillCountsAsAScan() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = page(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(image(doc, 850, 1100), 0, 0, W, H);
                text(cs, RenderingMode.NEITHER);
            }
            assertEquals(OptionalInt.of(100), OcrPageScan.scanDpi(page));
        }
    }

    @Test
    void visibleTextOrAPartialImageIsNotAScan() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage withText = page(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, withText)) {
                cs.drawImage(image(doc, 850, 1100), 0, 0, W, H);
                text(cs, RenderingMode.FILL);
            }
            PDPage halfCovered = page(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, halfCovered)) {
                cs.drawImage(image(doc, 850, 550), 0, 0, W, H / 2);
            }
            assertEquals(OptionalInt.empty(), OcrPageScan.scanDpi(withText));
            assertEquals(OptionalInt.empty(), OcrPageScan.scanDpi(halfCovered));
        }
    }

    private static PDPage page(PDDocument doc) {
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        return page;
    }

    private static PDImageXObject image(PDDocument doc, int width, int height) throws IOException {
        return LosslessFactory.createFromImage(
                doc, new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY));
    }

    private static void text(PDPageContentStream cs, RenderingMode mode) throws IOException {
        cs.beginText();
        cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
        cs.setRenderingMode(mode);
        cs.newLineAtOffset(72, 700);
        cs.showText("Invoice 1234");
        cs.endText();
    }
}
