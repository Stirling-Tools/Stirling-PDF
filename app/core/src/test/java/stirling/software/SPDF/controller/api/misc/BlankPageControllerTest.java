package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class BlankPageControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private BlankPageController blankPageController;

    @Test
    void isBlankImage_allWhite_returnsTrue() {
        BufferedImage image = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 100, 100);
        g.dispose();

        assertTrue(BlankPageController.isBlankImage(image, 10, 90.0, 10));
    }

    @Test
    void isBlankImage_allBlack_returnsFalse() {
        BufferedImage image = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.BLACK);
        g.fillRect(0, 0, 100, 100);
        g.dispose();

        assertFalse(BlankPageController.isBlankImage(image, 10, 90.0, 10));
    }

    @Test
    void isBlankImage_nullImage_returnsFalse() {
        assertFalse(BlankPageController.isBlankImage(null, 10, 90.0, 10));
    }

    @Test
    void isBlankImage_halfWhite_dependsOnThreshold() {
        BufferedImage image = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        // Top half white, bottom half black
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 100, 50);
        g.setColor(Color.BLACK);
        g.fillRect(0, 50, 100, 50);
        g.dispose();

        // With 90% threshold, should not be blank (only ~50% white)
        assertFalse(BlankPageController.isBlankImage(image, 10, 90.0, 10));
        // With 40% threshold, should be blank (>40% white)
        assertTrue(BlankPageController.isBlankImage(image, 10, 40.0, 10));
    }

    @Test
    void isBlankImage_highThreshold_morePixelsCountAsWhite() {
        BufferedImage image = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        // Fill with light gray (not quite white)
        g.setColor(new Color(240, 240, 240));
        g.fillRect(0, 0, 100, 100);
        g.dispose();

        // With strict threshold=0, gray pixels won't count as white
        assertFalse(BlankPageController.isBlankImage(image, 0, 90.0, 0));
        // With loose threshold=20, light gray counts as white
        assertTrue(BlankPageController.isBlankImage(image, 20, 90.0, 20));
    }

    @Test
    void isBlankImage_exactBoundary_whitePercent100() {
        BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 10, 10);
        g.dispose();

        // 100% white matches >= 100% threshold
        assertTrue(BlankPageController.isBlankImage(image, 10, 100.0, 10));
    }

    @Test
    void isBlankImage_singlePixel_white() {
        BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, Color.WHITE.getRGB());

        assertTrue(BlankPageController.isBlankImage(image, 10, 90.0, 10));
    }

    @Test
    void isBlankImage_singlePixel_black() {
        BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, Color.BLACK.getRGB());

        assertFalse(BlankPageController.isBlankImage(image, 10, 90.0, 10));
    }

    @Test
    void isBlankImage_nearWhiteWithLowThreshold_returnsFalse() {
        BufferedImage image = new BufferedImage(50, 50, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(new Color(245, 245, 245));
        g.fillRect(0, 0, 50, 50);
        g.dispose();

        // threshold=5 means 255-5=250 minimum, 245 < 250 so not white
        assertFalse(BlankPageController.isBlankImage(image, 5, 99.0, 5));
    }

    @Test
    void isBlankImage_whitePercentZero_alwaysBlank() {
        BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.BLACK);
        g.fillRect(0, 0, 10, 10);
        g.dispose();

        // 0% threshold means any amount of white is enough
        // Actually 0 white pixels = 0%, which is >= 0.0
        assertTrue(BlankPageController.isBlankImage(image, 10, 0.0, 10));
    }

    @Test
    void isBlankImage_largeImage_noError() {
        BufferedImage image = new BufferedImage(500, 500, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 500, 500);
        g.dispose();

        assertTrue(BlankPageController.isBlankImage(image, 10, 95.0, 10));
    }

    @Test
    void isBlankImage_maxThreshold_everythingIsWhite() {
        BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.BLACK);
        g.fillRect(0, 0, 10, 10);
        g.dispose();

        // threshold=255 means 255-255=0, so every pixel with blue >= 0 is white
        assertTrue(BlankPageController.isBlankImage(image, 255, 90.0, 255));
    }
}
