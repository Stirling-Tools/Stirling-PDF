package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Collections;
import java.util.Set;

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

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import stirling.software.SPDF.model.api.security.AddWatermarkRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@DisplayName("Watermark Validation Tests")
@ExtendWith(MockitoExtension.class)
class WatermarkValidationTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private WatermarkController watermarkController;

    private AddWatermarkRequest request;

    @BeforeEach
    void setUp() throws Exception {
        request = new AddWatermarkRequest();
        MockMultipartFile mockPdfFile =
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

        private Validator validator;

        @BeforeEach
        void setUpValidator() {
            ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
            validator = factory.getValidator();
        }

        @Test
        @DisplayName("Should reject count below minimum of 1")
        void testCountMinimum() {
            // Arrange
            request.setCount(0);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(v -> v.getPropertyPath().toString().equals("count")),
                    "Should have violation on 'count' field");
        }

        @Test
        @DisplayName("Should accept valid count value")
        void testCountValid() {
            // Arrange
            request.setCount(5);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertTrue(
                    violations.stream()
                            .noneMatch(v -> v.getPropertyPath().toString().equals("count")),
                    "Should have no violations on 'count' field");
        }

        @Test
        @DisplayName("Should reject count above maximum of 1000")
        void testCountMaximum() {
            // Arrange
            request.setCount(1001);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(v -> v.getPropertyPath().toString().equals("count")),
                    "Should have violation on 'count' field");
        }

        @Test
        @DisplayName("Should reject rotationMin below -360")
        void testRotationMinBelowBound() {
            // Arrange
            request.setRotationMin(-361f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(v -> v.getPropertyPath().toString().equals("rotationMin")),
                    "Should have violation on 'rotationMin' field");
        }

        @Test
        @DisplayName("Should reject rotationMax above 360")
        void testRotationMaxAboveBound() {
            // Arrange
            request.setRotationMax(361f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(v -> v.getPropertyPath().toString().equals("rotationMax")),
                    "Should have violation on 'rotationMax' field");
        }

        @Test
        @DisplayName("Should accept valid rotation values")
        void testRotationValid() {
            // Arrange
            request.setRotationMin(-180f);
            request.setRotationMax(180f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertTrue(
                    violations.stream()
                            .noneMatch(
                                    v ->
                                            v.getPropertyPath().toString().equals("rotationMin")
                                                    || v.getPropertyPath()
                                                            .toString()
                                                            .equals("rotationMax")),
                    "Should have no violations on rotation fields");
        }

        @Test
        @DisplayName("Should reject fontSizeMin below 1.0")
        void testFontSizeMinBelowBound() {
            // Arrange
            request.setFontSizeMin(0.5f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(v -> v.getPropertyPath().toString().equals("fontSizeMin")),
                    "Should have violation on 'fontSizeMin' field");
        }

        @Test
        @DisplayName("Should reject fontSizeMax above 500.0")
        void testFontSizeMaxAboveBound() {
            // Arrange
            request.setFontSizeMax(501f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(v -> v.getPropertyPath().toString().equals("fontSizeMax")),
                    "Should have violation on 'fontSizeMax' field");
        }

        @Test
        @DisplayName("Should accept valid font size values")
        void testFontSizeValid() {
            // Arrange
            request.setFontSizeMin(10f);
            request.setFontSizeMax(100f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertTrue(
                    violations.stream()
                            .noneMatch(
                                    v ->
                                            v.getPropertyPath().toString().equals("fontSizeMin")
                                                    || v.getPropertyPath()
                                                            .toString()
                                                            .equals("fontSizeMax")),
                    "Should have no violations on font size fields");
        }

        @Test
        @DisplayName("Should reject perLetterFontCount below 1")
        void testPerLetterFontCountMinimum() {
            // Arrange
            request.setPerLetterFontCount(0);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(
                                    v ->
                                            v.getPropertyPath()
                                                    .toString()
                                                    .equals("perLetterFontCount")),
                    "Should have violation on 'perLetterFontCount' field");
        }

        @Test
        @DisplayName("Should reject perLetterFontCount above 20")
        void testPerLetterFontCountMaximum() {
            // Arrange
            request.setPerLetterFontCount(21);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(
                                    v ->
                                            v.getPropertyPath()
                                                    .toString()
                                                    .equals("perLetterFontCount")),
                    "Should have violation on 'perLetterFontCount' field");
        }

        @Test
        @DisplayName("Should accept valid perLetterFontCount value")
        void testPerLetterFontCountValid() {
            // Arrange
            request.setPerLetterFontCount(5);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertTrue(
                    violations.stream()
                            .noneMatch(
                                    v ->
                                            v.getPropertyPath()
                                                    .toString()
                                                    .equals("perLetterFontCount")),
                    "Should have no violations on 'perLetterFontCount' field");
        }

        @Test
        @DisplayName("Should reject perLetterColorCount below 1")
        void testPerLetterColorCountMinimum() {
            // Arrange
            request.setPerLetterColorCount(0);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(
                                    v ->
                                            v.getPropertyPath()
                                                    .toString()
                                                    .equals("perLetterColorCount")),
                    "Should have violation on 'perLetterColorCount' field");
        }

        @Test
        @DisplayName("Should reject perLetterColorCount above 20")
        void testPerLetterColorCountMaximum() {
            // Arrange
            request.setPerLetterColorCount(21);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(
                                    v ->
                                            v.getPropertyPath()
                                                    .toString()
                                                    .equals("perLetterColorCount")),
                    "Should have violation on 'perLetterColorCount' field");
        }

        @Test
        @DisplayName("Should accept valid perLetterColorCount value")
        void testPerLetterColorCountValid() {
            // Arrange
            request.setPerLetterColorCount(4);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertTrue(
                    violations.stream()
                            .noneMatch(
                                    v ->
                                            v.getPropertyPath()
                                                    .toString()
                                                    .equals("perLetterColorCount")),
                    "Should have no violations on 'perLetterColorCount' field");
        }

        @Test
        @DisplayName("Should reject imageScale below 0.1")
        void testImageScaleBelowBound() {
            // Arrange
            request.setImageScale(0.05f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(v -> v.getPropertyPath().toString().equals("imageScale")),
                    "Should have violation on 'imageScale' field");
        }

        @Test
        @DisplayName("Should reject imageScale above 10.0")
        void testImageScaleAboveBound() {
            // Arrange
            request.setImageScale(11f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertFalse(violations.isEmpty(), "Should have validation errors");
            assertTrue(
                    violations.stream()
                            .anyMatch(v -> v.getPropertyPath().toString().equals("imageScale")),
                    "Should have violation on 'imageScale' field");
        }

        @Test
        @DisplayName("Should accept valid imageScale value")
        void testImageScaleValid() {
            // Arrange
            request.setImageScale(1.5f);

            // Act
            Set<ConstraintViolation<AddWatermarkRequest>> violations = validator.validate(request);

            // Assert
            assertTrue(
                    violations.stream()
                            .noneMatch(v -> v.getPropertyPath().toString().equals("imageScale")),
                    "Should have no violations on 'imageScale' field");
        }
    }
}
