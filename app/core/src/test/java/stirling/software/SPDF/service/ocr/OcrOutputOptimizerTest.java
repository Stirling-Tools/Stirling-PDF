package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Random;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;

class OcrOutputOptimizerTest {

    @Test
    void jpegsAreWrappedInFlateWithoutChangingPixels() throws IOException {
        BufferedImage scan = mostlyWhite();
        try (PDDocument doc = page(JPEGFactory.createFromImage(new PDDocument(), scan))) {
            int[] before = pixels(firstImage(doc).getImage());

            long saved = OcrOutputOptimizer.deflateJpegs(doc);

            assertTrue(saved > 0);
            try (PDDocument reread = reload(doc)) {
                PDImageXObject image = firstImage(reread);
                COSArray filters =
                        (COSArray) image.getCOSObject().getDictionaryObject(COSName.FILTER);
                assertEquals(COSName.FLATE_DECODE, filters.getObject(0));
                assertEquals(COSName.DCT_DECODE, filters.getObject(1));
                assertArrayEquals(before, pixels(image.getImage()));
            }
        }
    }

    @Test
    void nonJpegImagesAreLeftAlone() throws IOException {
        try (PDDocument doc =
                page(LosslessFactory.createFromImage(new PDDocument(), mostlyWhite()))) {
            assertEquals(0, OcrOutputOptimizer.deflateJpegs(doc));
            assertEquals(
                    COSName.FLATE_DECODE,
                    firstImage(doc).getCOSObject().getDictionaryObject(COSName.FILTER));
        }
    }

    @Test
    void removeImagesDropsEveryImage() throws IOException {
        try (PDDocument doc =
                page(LosslessFactory.createFromImage(new PDDocument(), mostlyWhite()))) {
            OcrOutputOptimizer.removeImages(doc);
            try (PDDocument reread = reload(doc)) {
                assertNull(firstImage(reread));
            }
        }
    }

    @Test
    void encodingFollowsPageContent() throws IOException {
        BufferedImage text = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = text.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 100);
        g.setColor(Color.BLACK);
        g.fillRect(20, 40, 50, 4);
        g.dispose();
        assertNotNull(OcrPageImages.encode(text).bilevel(), "black-on-white should go 1-bit");

        BufferedImage grey = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        Random random = new Random(1);
        for (int y = 0; y < 100; y++)
            for (int x = 0; x < 200; x++) {
                int v = 100 + random.nextInt(60);
                grey.setRGB(x, y, (v << 16) | (v << 8) | v);
            }
        OcrPageImages.Encoded greyEncoded = OcrPageImages.encode(grey);
        assertNotNull(greyEncoded.jpeg());
        assertEquals(
                BufferedImage.TYPE_BYTE_GRAY,
                javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(greyEncoded.jpeg()))
                        .getType());

        BufferedImage colour = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 100; y++) for (int x = 0; x < 200; x++) colour.setRGB(x, y, 0x3366cc);
        assertEquals(
                3,
                javax.imageio.ImageIO.read(
                                new java.io.ByteArrayInputStream(
                                        OcrPageImages.encode(colour).jpeg()))
                        .getColorModel()
                        .getNumColorComponents());
    }

    /** A scan-like page: white with a few dark strokes, the case Flate shrinks well. */
    private static BufferedImage mostlyWhite() {
        BufferedImage image = new BufferedImage(600, 800, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 600, 800);
        g.setColor(Color.BLACK);
        for (int y = 100; y < 700; y += 30) g.fillRect(60, y, 400, 6);
        g.dispose();
        return image;
    }

    /** Builds a one-page document drawing {@code image}, which was made against a scratch doc. */
    private static PDDocument page(PDImageXObject image) throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage();
        doc.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
            content.drawImage(image, 0, 0, 300, 400);
        }
        return reload(doc);
    }

    private static PDImageXObject firstImage(PDDocument doc) throws IOException {
        var resources = doc.getPage(0).getResources();
        for (COSName name : resources.getXObjectNames()) {
            if (resources.getXObject(name) instanceof PDImageXObject image) return image;
        }
        return null;
    }

    private static PDDocument reload(PDDocument doc) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        doc.save(out);
        return Loader.loadPDF(out.toByteArray());
    }

    private static int[] pixels(BufferedImage image) {
        return image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
    }
}
