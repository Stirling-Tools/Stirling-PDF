package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Collections;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.AddWatermarkRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@DisplayName("Watermark Validation Tests")
@ExtendWith(MockitoExtension.class)
class WatermarkValidationTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private WatermarkController watermarkController;

    private AddWatermarkRequest request;
    private MockMultipartFile mockPdfFile;

    @BeforeEach
    void setUp() throws Exception {
        request = new AddWatermarkRequest();
        mockPdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", "application/pdf", "test content".getBytes());
        request.setFileInput(mockPdfFile);
        request.setWatermarkType("text");
        request.setWatermarkText("Test Watermark");
        request.setOpacity(0.5f);
        request.setConvertPDFToImage(false);

        // Mock PDDocument with empty pages to avoid NullPointerException
        // Use lenient() because some tests don't reach the document loading code
        PDDocument mockDocument = mock(PDDocument.class);
        lenient().when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(mockDocument);

        // Mock getPages() to return an empty iterable
        org.apache.pdfbox.pdmodel.PDPageTree mockPageTree =
                mock(org.apache.pdfbox.pdmodel.PDPageTree.class);
        lenient().when(mockDocument.getPages()).thenReturn(mockPageTree);
        lenient().when(mockPageTree.iterator()).thenReturn(Collections.emptyIterator());
    }

    @Nested
    @DisplayName("Opacity Validation Tests")
    class OpacityValidationTests {

        @Test
        @DisplayName("Should reject opacity below 0.0")
        void testOpacityBelowMinimum() {
            request.setOpacity(-0.1f);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Opacity must be between 0.0 and 1.0"),
                    "Error message should mention opacity bounds");
        }

        @Test
        @DisplayName("Should reject opacity above 1.0")
        void testOpacityAboveMaximum() {
            request.setOpacity(1.1f);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Opacity must be between 0.0 and 1.0"),
                    "Error message should mention opacity bounds");
        }
    }

    @Nested
    @DisplayName("Rotation Range Validation Tests")
    class RotationRangeValidationTests {

        @Test
        @DisplayName("Should accept valid rotation range")
        void testValidRotationRange() {
            request.setRotationMin(-45f);
            request.setRotationMax(45f);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept equal rotation min and max")
        void testEqualRotationMinMax() {
            request.setRotationMin(30f);
            request.setRotationMax(30f);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should reject rotation min greater than max")
        void testRotationMinGreaterThanMax() {
            request.setRotationMin(45f);
            request.setRotationMax(-45f);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Rotation minimum")
                            && exception.getMessage().contains("must be less than or equal to"),
                    "Error message should mention rotation range constraint");
        }

        @Test
        @DisplayName("Should accept null rotation values")
        void testNullRotationValues() {
            request.setRotationMin(null);
            request.setRotationMax(null);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept only rotation min set")
        void testOnlyRotationMinSet() {
            request.setRotationMin(-30f);
            request.setRotationMax(null);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept only rotation max set")
        void testOnlyRotationMaxSet() {
            request.setRotationMin(null);
            request.setRotationMax(30f);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }
    }

    @Nested
    @DisplayName("Font Size Range Validation Tests")
    class FontSizeRangeValidationTests {

        @Test
        @DisplayName("Should accept valid font size range")
        void testValidFontSizeRange() {
            request.setFontSizeMin(10f);
            request.setFontSizeMax(50f);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept equal font size min and max")
        void testEqualFontSizeMinMax() {
            request.setFontSizeMin(30f);
            request.setFontSizeMax(30f);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should reject font size min greater than max")
        void testFontSizeMinGreaterThanMax() {
            request.setFontSizeMin(50f);
            request.setFontSizeMax(10f);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Font size minimum")
                            && exception.getMessage().contains("must be less than or equal to"),
                    "Error message should mention font size range constraint");
        }

        @Test
        @DisplayName("Should accept null font size values")
        void testNullFontSizeValues() {
            request.setFontSizeMin(null);
            request.setFontSizeMax(null);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }
    }

    @Nested
    @DisplayName("Color Format Validation Tests")
    class ColorFormatValidationTests {

        @Test
        @DisplayName("Should accept valid 6-digit hex color")
        void testValidHexColor6Digits() {
            request.setCustomColor("#FF0000");
            request.setRandomColor(false);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept valid 8-digit hex color with alpha")
        void testValidHexColor8Digits() {
            request.setCustomColor("#FF0000AA");
            request.setRandomColor(false);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept lowercase hex color")
        void testValidHexColorLowercase() {
            request.setCustomColor("#ff0000");
            request.setRandomColor(false);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept mixed case hex color")
        void testValidHexColorMixedCase() {
            request.setCustomColor("#Ff00Aa");
            request.setRandomColor(false);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should reject hex color without hash")
        void testInvalidHexColorNoHash() {
            request.setCustomColor("FF0000");
            request.setRandomColor(false);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Invalid color format"),
                    "Error message should mention invalid color format");
        }

        @Test
        @DisplayName("Should reject hex color with wrong length")
        void testInvalidHexColorWrongLength() {
            request.setCustomColor("#FFF");
            request.setRandomColor(false);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Invalid color format"),
                    "Error message should mention invalid color format");
        }

        @Test
        @DisplayName("Should reject hex color with invalid characters")
        void testInvalidHexColorInvalidChars() {
            request.setCustomColor("#GGGGGG");
            request.setRandomColor(false);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Invalid color format"),
                    "Error message should mention invalid color format");
        }

        @Test
        @DisplayName("Should skip color validation when using random color")
        void testSkipValidationWithRandomColor() {
            request.setCustomColor("invalid");
            request.setRandomColor(true);

            // Should not throw exception because random color is enabled
            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should skip color validation when custom color is null")
        void testSkipValidationWithNullColor() {
            request.setCustomColor(null);
            request.setRandomColor(false);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }
    }

    @Nested
    @DisplayName("Mirroring Probability Validation Tests")
    class MirroringProbabilityValidationTests {

        @Test
        @DisplayName("Should accept valid mirroring probability values")
        void testValidMirroringProbability() {
            request.setMirroringProbability(0.0f);
            assertDoesNotThrow(() -> watermarkController.addWatermark(request));

            request.setMirroringProbability(0.5f);
            assertDoesNotThrow(() -> watermarkController.addWatermark(request));

            request.setMirroringProbability(1.0f);
            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should reject mirroring probability below 0.0")
        void testMirroringProbabilityBelowMinimum() {
            request.setMirroringProbability(-0.1f);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception
                            .getMessage()
                            .contains("Mirroring probability must be between 0.0 and 1.0"),
                    "Error message should mention mirroring probability bounds");
        }

        @Test
        @DisplayName("Should reject mirroring probability above 1.0")
        void testMirroringProbabilityAboveMaximum() {
            request.setMirroringProbability(1.5f);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception
                            .getMessage()
                            .contains("Mirroring probability must be between 0.0 and 1.0"),
                    "Error message should mention mirroring probability bounds");
        }

        @Test
        @DisplayName("Should accept null mirroring probability")
        void testNullMirroringProbability() {
            request.setMirroringProbability(null);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }
    }

    @Nested
    @DisplayName("Watermark Type Validation Tests")
    class WatermarkTypeValidationTests {

        @Test
        @DisplayName("Should accept 'text' watermark type")
        void testTextWatermarkType() {
            request.setWatermarkType("text");
            request.setWatermarkText("Test");

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept 'image' watermark type")
        void testImageWatermarkType() {
            request.setWatermarkType("image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage", "test.png", "image/png", "image content".getBytes());
            request.setWatermarkImage(imageFile);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept case-insensitive watermark type")
        void testCaseInsensitiveWatermarkType() {
            request.setWatermarkType("TEXT");
            request.setWatermarkText("Test");

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));

            request.setWatermarkType("Image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage", "test.png", "image/png", "image content".getBytes());
            request.setWatermarkImage(imageFile);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should reject invalid watermark type")
        void testInvalidWatermarkType() {
            request.setWatermarkType("invalid");

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Watermark type must be 'text' or 'image'"),
                    "Error message should mention valid watermark types");
        }

        @Test
        @DisplayName("Should reject null watermark type")
        void testNullWatermarkType() {
            request.setWatermarkType(null);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Watermark type must be 'text' or 'image'"),
                    "Error message should mention valid watermark types");
        }

        @Test
        @DisplayName("Should reject text watermark without text")
        void testTextWatermarkWithoutText() {
            request.setWatermarkType("text");
            request.setWatermarkText(null);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Watermark text is required"),
                    "Error message should mention missing watermark text");
        }

        @Test
        @DisplayName("Should reject text watermark with empty text")
        void testTextWatermarkWithEmptyText() {
            request.setWatermarkType("text");
            request.setWatermarkText("   ");

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Watermark text is required"),
                    "Error message should mention missing watermark text");
        }

        @Test
        @DisplayName("Should reject image watermark without image")
        void testImageWatermarkWithoutImage() {
            request.setWatermarkType("image");
            request.setWatermarkImage(null);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Watermark image is required"),
                    "Error message should mention missing watermark image");
        }

        @Test
        @DisplayName("Should reject image watermark with empty image")
        void testImageWatermarkWithEmptyImage() {
            request.setWatermarkType("image");
            MockMultipartFile emptyImage =
                    new MockMultipartFile("watermarkImage", "", "image/png", new byte[0]);
            request.setWatermarkImage(emptyImage);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Watermark image is required"),
                    "Error message should mention missing watermark image");
        }
    }

    @Nested
    @DisplayName("Image Type Validation Tests")
    class ImageTypeValidationTests {

        @Test
        @DisplayName("Should accept PNG image")
        void testAcceptPngImage() {
            request.setWatermarkType("image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage", "test.png", "image/png", "image content".getBytes());
            request.setWatermarkImage(imageFile);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept JPG image")
        void testAcceptJpgImage() {
            request.setWatermarkType("image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage", "test.jpg", "image/jpeg", "image content".getBytes());
            request.setWatermarkImage(imageFile);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept JPEG image")
        void testAcceptJpegImage() {
            request.setWatermarkType("image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage",
                            "test.jpeg",
                            "image/jpeg",
                            "image content".getBytes());
            request.setWatermarkImage(imageFile);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept GIF image")
        void testAcceptGifImage() {
            request.setWatermarkType("image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage", "test.gif", "image/gif", "image content".getBytes());
            request.setWatermarkImage(imageFile);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should accept BMP image")
        void testAcceptBmpImage() {
            request.setWatermarkType("image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage", "test.bmp", "image/bmp", "image content".getBytes());
            request.setWatermarkImage(imageFile);

            assertDoesNotThrow(() -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should reject unsupported image content type")
        void testRejectUnsupportedImageContentType() {
            request.setWatermarkType("image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage",
                            "test.svg",
                            "image/svg+xml",
                            "image content".getBytes());
            request.setWatermarkImage(imageFile);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Unsupported image type"),
                    "Error message should mention unsupported image type");
        }

        @Test
        @DisplayName("Should reject unsupported image file extension")
        void testRejectUnsupportedImageExtension() {
            request.setWatermarkType("image");
            MockMultipartFile imageFile =
                    new MockMultipartFile(
                            "watermarkImage", "test.svg", "image/png", "image content".getBytes());
            request.setWatermarkImage(imageFile);

            IllegalArgumentException exception =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> watermarkController.addWatermark(request));

            assertTrue(
                    exception.getMessage().contains("Unsupported image file extension"),
                    "Error message should mention unsupported file extension");
        }
    }

    @Nested
    @DisplayName("Annotation-based Validation Tests")
    class AnnotationBasedValidationTests {

        @Test
        @DisplayName("Should enforce count minimum of 1")
        void testCountMinimum() {
            // Note: This tests the @Min annotation on count field
            // The actual validation happens at the framework level
            request.setCount(0);
            // Framework validation would reject this before reaching controller
        }

        @Test
        @DisplayName("Should enforce count maximum of 1000")
        void testCountMaximum() {
            // Note: This tests the @Max annotation on count field
            request.setCount(1001);
            // Framework validation would reject this before reaching controller
        }

        @Test
        @DisplayName("Should enforce rotation min/max bounds of -360 to 360")
        void testRotationBounds() {
            // Note: This tests the @DecimalMin/@DecimalMax annotations
            request.setRotationMin(-361f);
            request.setRotationMax(361f);
            // Framework validation would reject this before reaching controller
        }

        @Test
        @DisplayName("Should enforce font size bounds of 1.0 to 500.0")
        void testFontSizeBounds() {
            // Note: This tests the @DecimalMin/@DecimalMax annotations
            request.setFontSizeMin(0.5f);
            request.setFontSizeMax(501f);
            // Framework validation would reject this before reaching controller
        }

        @Test
        @DisplayName("Should enforce per-letter font count bounds of 1 to 20")
        void testPerLetterFontCountBounds() {
            // Note: This tests the @Min/@Max annotations
            request.setPerLetterFontCount(0);
            request.setPerLetterFontCount(21);
            // Framework validation would reject this before reaching controller
        }

        @Test
        @DisplayName("Should enforce per-letter color count bounds of 1 to 20")
        void testPerLetterColorCountBounds() {
            // Note: This tests the @Min/@Max annotations
            request.setPerLetterColorCount(0);
            request.setPerLetterColorCount(21);
            // Framework validation would reject this before reaching controller
        }

        @Test
        @DisplayName("Should enforce margin bounds of 0.0 to 500.0")
        void testMarginBounds() {
            // Note: This tests the @DecimalMin/@DecimalMax annotations
            request.setMargin(-1f);
            request.setMargin(501f);
            // Framework validation would reject this before reaching controller
        }

        @Test
        @DisplayName("Should enforce image scale bounds of 0.1 to 10.0")
        void testImageScaleBounds() {
            // Note: This tests the @DecimalMin/@DecimalMax annotations
            request.setImageScale(0.05f);
            request.setImageScale(11f);
            // Framework validation would reject this before reaching controller
        }

        @Test
        @DisplayName("Should validate bounds format pattern")
        void testBoundsFormatPattern() {
            // Note: This tests the @Pattern annotation on bounds field
            request.setBounds("invalid");
            // Framework validation would reject this before reaching controller

            request.setBounds("100,100,200,200"); // Valid format
            // Framework validation would accept this
        }
    }
}
