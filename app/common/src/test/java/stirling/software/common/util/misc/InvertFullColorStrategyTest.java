package stirling.software.common.util.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.InputStreamResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.misc.ReplaceAndInvert;

@DisplayName("InvertFullColorStrategy Tests")
class InvertFullColorStrategyTest {

    private InvertFullColorStrategy strategy;

    @BeforeEach
    void setUp() throws Exception {
        // Create a simple PDF document for testing
        byte[] pdfBytes = createSimplePdfWithRectangle();
        MultipartFile mockPdfFile =
                new MockMultipartFile("file", "test.pdf", "application/pdf", pdfBytes);

        // Create the strategy instance
        strategy = new InvertFullColorStrategy(mockPdfFile, ReplaceAndInvert.FULL_INVERSION);
    }

    /** Helper method to create a simple PDF with a colored rectangle for testing */
    private byte[] createSimplePdfWithRectangle() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);

        // Add a filled rectangle with a specific color
        PDPageContentStream contentStream = new PDPageContentStream(document, page);
        contentStream.setNonStrokingColor(
                new PDColor(new float[] {0.8f, 0.2f, 0.2f}, PDDeviceRGB.INSTANCE));
        contentStream.addRect(100, 100, 400, 400);
        contentStream.fill();
        contentStream.close();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();

        return baos.toByteArray();
    }

    @Nested
    @DisplayName("Replace Method Tests")
    class ReplaceMethodTests {

        @Test
        @DisplayName("Replace method returns non-null InputStreamResource")
        void testReplace() throws IOException {
            // Act
            InputStreamResource result = strategy.replace();

            // Assert
            assertNotNull(result, "Result from replace should not be null");
        }
    }

    @Nested
    @DisplayName("Private Method Tests via Reflection")
    class PrivateMethodTests {

        @Test
        @DisplayName("invertImageColors inverts RGB channels correctly")
        void testInvertImageColors()
                throws NoSuchMethodException, InvocationTargetException, IllegalAccessException {
            // Arrange: Create a test image with known colors
            BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_ARGB);
            java.awt.Graphics graphics = image.getGraphics();
            graphics.setColor(new Color(200, 100, 50)); // RGB color to be inverted
            graphics.fillRect(0, 0, 10, 10);
            graphics.dispose();

            // Get the color of a pixel before inversion
            Color originalColor = new Color(image.getRGB(5, 5), true);

            // Access private method using reflection
            Method invertMethodRef =
                    InvertFullColorStrategy.class.getDeclaredMethod(
                            "invertImageColors", BufferedImage.class);
            invertMethodRef.setAccessible(true);

            // Act: Invoke the private method
            invertMethodRef.invoke(strategy, image);

            // Assert: Get the color of the same pixel after inversion
            Color invertedColor = new Color(image.getRGB(5, 5), true);
            assertEquals(
                    255 - originalColor.getRed(),
                    invertedColor.getRed(),
                    "Red channel should be inverted");
            assertEquals(
                    255 - originalColor.getGreen(),
                    invertedColor.getGreen(),
                    "Green channel should be inverted");
            assertEquals(
                    255 - originalColor.getBlue(),
                    invertedColor.getBlue(),
                    "Blue channel should be inverted");
        }

        @Test
        @DisplayName("convertToBufferedImageTpFile converts image to file correctly")
        void testConvertToBufferedImageTpFile()
                throws NoSuchMethodException,
                        InvocationTargetException,
                        IllegalAccessException,
                        IOException {
            // Arrange: Create a test image
            BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_ARGB);

            // Access private method using reflection
            Method convertMethodRef =
                    InvertFullColorStrategy.class.getDeclaredMethod(
                            "convertToBufferedImageTpFile", BufferedImage.class);
            convertMethodRef.setAccessible(true);

            // Act: Invoke the private method
            File result = (File) convertMethodRef.invoke(strategy, image);

            try {
                // Assert that the file exists and is not empty
                assertNotNull(result, "Result file should not be null");
                assertTrue(result.exists(), "File should exist after conversion");
                assertTrue(result.length() > 0, "File should not be empty");

                // Check that the file can be read back as an image
                BufferedImage readBack = ImageIO.read(result);
                assertNotNull(readBack, "Should be able to read back the image from file");
                assertEquals(10, readBack.getWidth(), "Image width should match original");
                assertEquals(10, readBack.getHeight(), "Image height should match original");
            } finally {
                // Clean up
                if (result != null && result.exists()) {
                    Files.delete(result.toPath());
                }
            }
        }
    }
}
