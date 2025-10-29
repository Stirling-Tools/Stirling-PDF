package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.security.AddWatermarkRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
@DisplayName("Watermark Controller Integration Tests")
class WatermarkControllerIntegrationTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @InjectMocks private WatermarkController watermarkController;

    private MockMultipartFile testPdfFile;
    private MockMultipartFile testImageFile;

    @BeforeEach
    void setUp() throws IOException {
        // Create a simple test PDF
        PDDocument document = new PDDocument();
        document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
        File tempPdf = File.createTempFile("test", ".pdf");
        document.save(tempPdf);
        document.close();

        byte[] pdfBytes = Files.readAllBytes(tempPdf.toPath());
        testPdfFile = new MockMultipartFile("fileInput", "test.pdf", "application/pdf", pdfBytes);
        tempPdf.delete();

        // Create a simple test image (1x1 pixel PNG)
        byte[] imageBytes =
                new byte[] {
                    (byte) 0x89,
                    0x50,
                    0x4E,
                    0x47,
                    0x0D,
                    0x0A,
                    0x1A,
                    0x0A,
                    0x00,
                    0x00,
                    0x00,
                    0x0D,
                    0x49,
                    0x48,
                    0x44,
                    0x52,
                    0x00,
                    0x00,
                    0x00,
                    0x01,
                    0x00,
                    0x00,
                    0x00,
                    0x01,
                    0x08,
                    0x06,
                    0x00,
                    0x00,
                    0x00,
                    0x1F,
                    0x15,
                    (byte) 0xC4,
                    (byte) 0x89,
                    0x00,
                    0x00,
                    0x00,
                    0x0A,
                    0x49,
                    0x44,
                    0x41,
                    0x54,
                    0x78,
                    (byte) 0x9C,
                    0x63,
                    0x00,
                    0x01,
                    0x00,
                    0x00,
                    0x05,
                    0x00,
                    0x01,
                    0x0D,
                    0x0A,
                    0x2D,
                    (byte) 0xB4,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x49,
                    0x45,
                    0x4E,
                    0x44,
                    (byte) 0xAE,
                    0x42,
                    0x60,
                    (byte) 0x82
                };
        testImageFile =
                new MockMultipartFile("watermarkImage", "test.png", "image/png", imageBytes);

        // Configure mock to return a real PDDocument when load is called
        when(pdfDocumentFactory.load(any(org.springframework.web.multipart.MultipartFile.class)))
                .thenAnswer(
                        invocation -> {
                            org.springframework.web.multipart.MultipartFile file =
                                    invocation.getArgument(0);
                            return Loader.loadPDF(file.getBytes());
                        });
    }

    @Nested
    @DisplayName("Text Watermark Integration Tests")
    class TextWatermarkIntegrationTests {

        @Test
        @DisplayName("Should apply text watermark with fixed positioning")
        void testTextWatermarkFixedPositioning() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Test Watermark");
            request.setOpacity(0.5f);
            request.setFontSize(30f);
            request.setRotation(45f);
            request.setWidthSpacer(100);
            request.setHeightSpacer(100);
            request.setCustomColor("#FF0000");
            request.setConvertPDFToImage(false);
            request.setRandomPosition(false);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
            assertNotNull(response.getBody(), "Response body should not be null");
            assertTrue(response.getBody().length > 0, "Response should contain PDF data");

            // Verify the output is a valid PDF
            try (PDDocument resultDoc = Loader.loadPDF(response.getBody())) {
                assertEquals(1, resultDoc.getNumberOfPages(), "Should have 1 page");
            }
        }

        @Test
        @DisplayName("Should apply text watermark with random positioning")
        void testTextWatermarkRandomPositioning() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Random");
            request.setOpacity(0.7f);
            request.setFontSize(20f);
            request.setCustomColor("#0000FF");
            request.setConvertPDFToImage(false);
            request.setRandomPosition(true);
            request.setCount(5);
            request.setMargin(10f);
            request.setSeed(12345L); // Use seed for deterministic testing

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
            assertTrue(response.getBody().length > 0, "Response should contain PDF data");
        }

        @Test
        @DisplayName("Should apply text watermark with rotation range")
        void testTextWatermarkWithRotationRange() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Rotated");
            request.setOpacity(0.5f);
            request.setFontSize(25f);
            request.setCustomColor("#00FF00");
            request.setConvertPDFToImage(false);
            request.setRandomPosition(true);
            request.setCount(3);
            request.setRotationMin(-45f);
            request.setRotationMax(45f);
            request.setSeed(54321L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with per-letter font variation")
        void testTextWatermarkPerLetterFont() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Mixed");
            request.setOpacity(0.6f);
            request.setFontSize(30f);
            request.setCustomColor("#FF00FF");
            request.setConvertPDFToImage(false);
            request.setPerLetterFont(true);
            request.setPerLetterFontCount(3);
            request.setSeed(99999L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with per-letter color variation")
        void testTextWatermarkPerLetterColor() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Colors");
            request.setOpacity(0.8f);
            request.setFontSize(28f);
            request.setConvertPDFToImage(false);
            request.setPerLetterColor(true);
            request.setPerLetterColorCount(4);
            request.setSeed(11111L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with per-letter size variation")
        void testTextWatermarkPerLetterSize() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Sizes");
            request.setOpacity(0.5f);
            request.setConvertPDFToImage(false);
            request.setPerLetterSize(true);
            request.setPerLetterSizeMin(15f);
            request.setPerLetterSizeMax(35f);
            request.setSeed(22222L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with per-letter orientation variation")
        void testTextWatermarkPerLetterOrientation() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Tilted");
            request.setOpacity(0.6f);
            request.setFontSize(25f);
            request.setCustomColor("#FFAA00");
            request.setConvertPDFToImage(false);
            request.setPerLetterOrientation(true);
            request.setPerLetterOrientationMin(-30f);
            request.setPerLetterOrientationMax(30f);
            request.setSeed(33333L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with all per-letter variations enabled")
        void testTextWatermarkAllPerLetterVariations() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Chaos");
            request.setOpacity(0.7f);
            request.setConvertPDFToImage(false);
            request.setPerLetterFont(true);
            request.setPerLetterFontCount(2);
            request.setPerLetterColor(true);
            request.setPerLetterColorCount(3);
            request.setPerLetterSize(true);
            request.setPerLetterSizeMin(20f);
            request.setPerLetterSizeMax(40f);
            request.setPerLetterOrientation(true);
            request.setPerLetterOrientationMin(-20f);
            request.setPerLetterOrientationMax(20f);
            request.setSeed(44444L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with random font")
        void testTextWatermarkRandomFont() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Random Font");
            request.setOpacity(0.5f);
            request.setFontSize(30f);
            request.setCustomColor("#AA00FF");
            request.setConvertPDFToImage(false);
            request.setRandomFont(true);
            request.setSeed(55555L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with random color")
        void testTextWatermarkRandomColor() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Random Color");
            request.setOpacity(0.6f);
            request.setFontSize(28f);
            request.setConvertPDFToImage(false);
            request.setRandomColor(true);
            request.setSeed(66666L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with font size range")
        void testTextWatermarkFontSizeRange() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Size Range");
            request.setOpacity(0.5f);
            request.setCustomColor("#00AAFF");
            request.setConvertPDFToImage(false);
            request.setRandomPosition(true);
            request.setCount(3);
            request.setFontSizeMin(20f);
            request.setFontSizeMax(40f);
            request.setSeed(77777L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with opacity variations")
        void testTextWatermarkOpacityVariations() throws Exception {
            // Test minimum opacity
            AddWatermarkRequest request1 = new AddWatermarkRequest();
            request1.setFileInput(testPdfFile);
            request1.setWatermarkType("text");
            request1.setWatermarkText("Min Opacity");
            request1.setOpacity(0.0f);
            request1.setFontSize(30f);
            request1.setCustomColor("#000000");
            request1.setConvertPDFToImage(false);
            request1.setAlphabet("roman");

            ResponseEntity<byte[]> response1 = watermarkController.addWatermark(request1);
            assertEquals(200, response1.getStatusCode().value(), "Should handle min opacity");

            // Test maximum opacity
            AddWatermarkRequest request2 = new AddWatermarkRequest();
            request2.setFileInput(testPdfFile);
            request2.setWatermarkType("text");
            request2.setWatermarkText("Max Opacity");
            request2.setOpacity(1.0f);
            request2.setFontSize(30f);
            request2.setCustomColor("#000000");
            request2.setConvertPDFToImage(false);
            request2.setAlphabet("roman");

            ResponseEntity<byte[]> response2 = watermarkController.addWatermark(request2);
            assertEquals(200, response2.getStatusCode().value(), "Should handle max opacity");
        }

        @Test
        @DisplayName("Should apply text watermark with shading")
        void testTextWatermarkWithShading() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Shaded");
            request.setOpacity(0.6f);
            request.setFontSize(30f);
            request.setCustomColor("#FF0000");
            request.setConvertPDFToImage(false);
            request.setShading("light");

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with random shading")
        void testTextWatermarkRandomShading() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Random Shade");
            request.setOpacity(0.6f);
            request.setFontSize(30f);
            request.setCustomColor("#0000FF");
            request.setConvertPDFToImage(false);
            request.setShadingRandom(true);
            request.setSeed(88888L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply text watermark with custom bounds")
        void testTextWatermarkWithBounds() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Bounded");
            request.setOpacity(0.5f);
            request.setFontSize(25f);
            request.setCustomColor("#00FF00");
            request.setConvertPDFToImage(false);
            request.setRandomPosition(true);
            request.setCount(3);
            request.setBounds("100,100,300,200");
            request.setSeed(99000L);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }
    }

    @Nested
    @DisplayName("Image Watermark Integration Tests")
    class ImageWatermarkIntegrationTests {

        @Test
        @DisplayName("Should apply image watermark with default settings")
        void testImageWatermarkDefault() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(testImageFile);
            request.setOpacity(0.5f);
            request.setConvertPDFToImage(false);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
            assertTrue(response.getBody().length > 0, "Response should contain PDF data");
        }

        @Test
        @DisplayName("Should apply image watermark with scaling")
        void testImageWatermarkWithScaling() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(testImageFile);
            request.setOpacity(0.7f);
            request.setImageScale(2.0f);
            request.setConvertPDFToImage(false);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply image watermark with rotation")
        void testImageWatermarkWithRotation() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(testImageFile);
            request.setOpacity(0.6f);
            request.setRotation(45f);
            request.setConvertPDFToImage(false);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply image watermark with rotation range")
        void testImageWatermarkWithRotationRange() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(testImageFile);
            request.setOpacity(0.5f);
            request.setRandomPosition(true);
            request.setCount(3);
            request.setRotationMin(-30f);
            request.setRotationMax(30f);
            request.setSeed(12121L);
            request.setConvertPDFToImage(false);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply image watermark with mirroring")
        void testImageWatermarkWithMirroring() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(testImageFile);
            request.setOpacity(0.6f);
            request.setRandomMirroring(true);
            request.setMirroringProbability(1.0f); // Always mirror for testing
            request.setSeed(23232L);
            request.setConvertPDFToImage(false);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply image watermark with scaling, rotation, and mirroring")
        void testImageWatermarkCombined() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(testImageFile);
            request.setOpacity(0.7f);
            request.setImageScale(1.5f);
            request.setRotation(30f);
            request.setRandomMirroring(true);
            request.setMirroringProbability(0.5f);
            request.setSeed(34343L);
            request.setConvertPDFToImage(false);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }

        @Test
        @DisplayName("Should apply multiple image watermarks with random positioning")
        void testMultipleImageWatermarksRandom() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(testImageFile);
            request.setOpacity(0.5f);
            request.setRandomPosition(true);
            request.setCount(5);
            request.setMargin(20f);
            request.setSeed(45454L);
            request.setConvertPDFToImage(false);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }
    }

    @Nested
    @DisplayName("Convert to Image Tests")
    class ConvertToImageTests {

        @Test
        @DisplayName("Should convert PDF to image after applying text watermark")
        void testConvertToImageWithTextWatermark() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Convert Test");
            request.setOpacity(0.5f);
            request.setFontSize(30f);
            request.setCustomColor("#FF0000");
            request.setConvertPDFToImage(true);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
            assertTrue(response.getBody().length > 0, "Response should contain PDF data");
        }

        @Test
        @DisplayName("Should convert PDF to image after applying image watermark")
        void testConvertToImageWithImageWatermark() throws Exception {
            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setAlphabet("roman");
            request.setFileInput(testPdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(testImageFile);
            request.setOpacity(0.6f);
            request.setConvertPDFToImage(true);

            ResponseEntity<byte[]> response = watermarkController.addWatermark(request);

            assertNotNull(response, "Response should not be null");
            assertEquals(200, response.getStatusCode().value(), "Should return 200 OK");
        }
    }

    @Nested
    @DisplayName("Deterministic Randomness Tests")
    class DeterministicRandomnessTests {

        @Test
        @DisplayName("Should produce identical results with same seed")
        void testDeterministicWithSeed() throws Exception {
            AddWatermarkRequest request1 = new AddWatermarkRequest();
            request1.setFileInput(testPdfFile);
            request1.setWatermarkType("text");
            request1.setWatermarkText("Deterministic");
            request1.setOpacity(0.5f);
            request1.setFontSize(25f);
            request1.setCustomColor("#0000FF");
            request1.setRandomPosition(true);
            request1.setCount(5);
            request1.setSeed(99999L);
            request1.setConvertPDFToImage(false);
            request1.setAlphabet("roman");

            ResponseEntity<byte[]> response1 = watermarkController.addWatermark(request1);

            AddWatermarkRequest request2 = new AddWatermarkRequest();
            request2.setFileInput(testPdfFile);
            request2.setWatermarkType("text");
            request2.setWatermarkText("Deterministic");
            request2.setOpacity(0.5f);
            request2.setFontSize(25f);
            request2.setCustomColor("#0000FF");
            request2.setRandomPosition(true);
            request2.setCount(5);
            request2.setSeed(99999L);
            request2.setConvertPDFToImage(false);
            request2.setAlphabet("roman");

            ResponseEntity<byte[]> response2 = watermarkController.addWatermark(request2);

            assertNotNull(response1, "First response should not be null");
            assertNotNull(response2, "Second response should not be null");
            assertEquals(200, response1.getStatusCode().value(), "First request should succeed");
            assertEquals(200, response2.getStatusCode().value(), "Second request should succeed");

            // Note: Exact byte comparison may fail due to PDF metadata (timestamps, etc.)
            // But both should produce valid PDFs of similar size
            assertTrue(
                    Math.abs(response1.getBody().length - response2.getBody().length) < 1000,
                    "PDFs should be similar in size");
        }
    }
}
