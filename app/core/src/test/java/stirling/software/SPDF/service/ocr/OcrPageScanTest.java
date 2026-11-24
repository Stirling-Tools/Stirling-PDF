package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.CCITTFactory;
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
            assertEquals(Optional.of(new OcrPageScan.Scan(100, false)), OcrPageScan.scan(page));
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
            assertEquals(Optional.of(new OcrPageScan.Scan(200, false)), OcrPageScan.scan(page));
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
            assertEquals(Optional.of(new OcrPageScan.Scan(100, false)), OcrPageScan.scan(page));
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
            assertEquals(Optional.of(new OcrPageScan.Scan(100, false)), OcrPageScan.scan(page));
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
            assertEquals(Optional.empty(), OcrPageScan.scan(withText));
            assertEquals(Optional.empty(), OcrPageScan.scan(halfCovered));
        }
    }

    @Test
    void oneBitImagesMakeABlackAndWhiteScan() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage bilevel = page(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, bilevel)) {
                cs.drawImage(binaryImage(doc, 1700, 2200), 0, 0, W, H);
            }
            PDPage mixed = page(doc);
            try (PDPageContentStream cs = new PDPageContentStream(doc, mixed)) {
                cs.drawImage(binaryImage(doc, 1700, 1100), 0, 0, W, H / 2);
                cs.drawImage(image(doc, 1700, 1100), 0, H / 2, W, H / 2);
            }
            assertEquals(Optional.of(new OcrPageScan.Scan(200, true)), OcrPageScan.scan(bilevel));
            assertEquals(Optional.of(new OcrPageScan.Scan(200, false)), OcrPageScan.scan(mixed));
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

    private static PDImageXObject binaryImage(PDDocument doc, int width, int height)
            throws IOException {
        return CCITTFactory.createFromImage(
                doc, new BufferedImage(width, height, BufferedImage.TYPE_BYTE_BINARY));
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
