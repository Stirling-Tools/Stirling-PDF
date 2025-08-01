package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.Color;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("ImageProcessingUtils Tests")
public class ImageProcessingUtilsTest {

    private BufferedImage createSourceImage() {
        BufferedImage sourceImage = new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB);
        fillImageWithColor(sourceImage);
        return sourceImage;
    }

    @Nested
    @DisplayName("Greyscale Conversion Tests")
    class GreyscaleConversionTests {

        @Test
        @DisplayName("Converts image to greyscale correctly")
        void testConvertColorTypeToGreyscale() {
            BufferedImage sourceImage = createSourceImage();

            BufferedImage convertedImage =
                    ImageProcessingUtils.convertColorType(sourceImage, "greyscale");

            assertNotNull(convertedImage, "Converted image should not be null");
            assertEquals(
                    BufferedImage.TYPE_BYTE_GRAY,
                    convertedImage.getType(),
                    "Image type should be greyscale");
            assertEquals(
                    sourceImage.getWidth(),
                    convertedImage.getWidth(),
                    "Width should remain unchanged");
            assertEquals(
                    sourceImage.getHeight(),
                    convertedImage.getHeight(),
                    "Height should remain unchanged");

            // Check if a pixel is correctly converted to greyscale
            Color grey = new Color(convertedImage.getRGB(0, 0));
            assertEquals(
                    grey.getRed(),
                    grey.getGreen(),
                    "Red and green channels should be equal in greyscale");
            assertEquals(
                    grey.getGreen(),
                    grey.getBlue(),
                    "Green and blue channels should be equal in greyscale");
        }
    }

    @Nested
    @DisplayName("Black and White Conversion Tests")
    class BlackWhiteConversionTests {

        @Test
        @DisplayName("Converts image to black and white correctly")
        void testConvertColorTypeToBlackWhite() {
            BufferedImage sourceImage = createSourceImage();

            BufferedImage convertedImage =
                    ImageProcessingUtils.convertColorType(sourceImage, "blackwhite");

            assertNotNull(convertedImage, "Converted image should not be null");
            assertEquals(
                    BufferedImage.TYPE_BYTE_BINARY,
                    convertedImage.getType(),
                    "Image type should be black and white");
            assertEquals(
                    sourceImage.getWidth(),
                    convertedImage.getWidth(),
                    "Width should remain unchanged");
            assertEquals(
                    sourceImage.getHeight(),
                    convertedImage.getHeight(),
                    "Height should remain unchanged");

            // Check if a pixel is converted correctly (binary image will be either black or white)
            int rgb = convertedImage.getRGB(0, 0);
            assertTrue(
                    rgb == Color.BLACK.getRGB() || rgb == Color.WHITE.getRGB(),
                    "Pixel should be either black or white in binary image");
        }
    }

    @Nested
    @DisplayName("Full Color and Invalid Type Tests")
    class FullColorAndInvalidTypeTests {

        @Test
        @DisplayName("Returns original image for full color conversion")
        void testConvertColorTypeToFullColor() {
            BufferedImage sourceImage = createSourceImage();

            BufferedImage convertedImage =
                    ImageProcessingUtils.convertColorType(sourceImage, "fullcolor");

            assertNotNull(convertedImage, "Converted image should not be null");
            assertSame(
                    sourceImage, convertedImage, "Should return the original image for full color");
        }

        @Test
        @DisplayName("Returns original image for invalid color type")
        void testConvertColorTypeInvalid() {
            BufferedImage sourceImage = createSourceImage();

            BufferedImage convertedImage =
                    ImageProcessingUtils.convertColorType(sourceImage, "invalidtype");

            assertNotNull(convertedImage, "Converted image should not be null");
            assertSame(
                    sourceImage,
                    convertedImage,
                    "Should return the original image for invalid type");
        }
    }

    private void fillImageWithColor(BufferedImage image) {
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                image.setRGB(x, y, Color.RED.getRGB());
            }
        }
    }
}
