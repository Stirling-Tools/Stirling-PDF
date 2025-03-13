package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.*;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.Test;

public class ImageProcessingUtilsTest {

    @Test
    void testConvertColorTypeToGreyscale() {
        BufferedImage sourceImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        fillImageWithColor(sourceImage, Color.RED);

        BufferedImage convertedImage =
                ImageProcessingUtils.convertColorType(sourceImage, "greyscale");

        assertNotNull(convertedImage);
        assertEquals(BufferedImage.TYPE_BYTE_GRAY, convertedImage.getType());
        assertEquals(sourceImage.getWidth(), convertedImage.getWidth());
        assertEquals(sourceImage.getHeight(), convertedImage.getHeight());

        // Check if a pixel is correctly converted to greyscale
        Color grey = new Color(convertedImage.getRGB(0, 0));
        assertEquals(grey.getRed(), grey.getGreen());
        assertEquals(grey.getGreen(), grey.getBlue());
    }

    @Test
    void testConvertColorTypeToBlackWhite() {
        BufferedImage sourceImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        fillImageWithColor(sourceImage, Color.RED);

        BufferedImage convertedImage =
                ImageProcessingUtils.convertColorType(sourceImage, "blackwhite");

        assertNotNull(convertedImage);
        assertEquals(BufferedImage.TYPE_BYTE_BINARY, convertedImage.getType());
        assertEquals(sourceImage.getWidth(), convertedImage.getWidth());
        assertEquals(sourceImage.getHeight(), convertedImage.getHeight());

        // Check if a pixel is converted correctly (binary image will be either black or white)
        int rgb = convertedImage.getRGB(0, 0);
        assertTrue(rgb == Color.BLACK.getRGB() || rgb == Color.WHITE.getRGB());
    }

    @Test
    void testConvertColorTypeToFullColor() {
        BufferedImage sourceImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        fillImageWithColor(sourceImage, Color.RED);

        BufferedImage convertedImage =
                ImageProcessingUtils.convertColorType(sourceImage, "fullcolor");

        assertNotNull(convertedImage);
        assertEquals(sourceImage, convertedImage);
    }

    @Test
    void testConvertColorTypeInvalid() {
        BufferedImage sourceImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        fillImageWithColor(sourceImage, Color.RED);

        BufferedImage convertedImage =
                ImageProcessingUtils.convertColorType(sourceImage, "invalidtype");

        assertNotNull(convertedImage);
        assertEquals(sourceImage, convertedImage);
    }

    private void fillImageWithColor(BufferedImage image, Color color) {
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                image.setRGB(x, y, color.getRGB());
            }
        }
    }
}
