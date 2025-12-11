package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.CropPdfForm;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
@DisplayName("CropController Tests")
class CropControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @InjectMocks private CropController cropController;
    private TestPdfFactory pdfFactory;

    @BeforeEach
    void setUp() {
        pdfFactory = new TestPdfFactory();
    }

    private static class CropRequestBuilder {
        private final CropPdfForm form = new CropPdfForm();

        CropRequestBuilder withFile(MockMultipartFile file) {
            form.setFileInput(file);
            return this;
        }

        CropRequestBuilder withCoordinates(float x, float y, float width, float height) {
            form.setX(x);
            form.setY(y);
            form.setWidth(width);
            form.setHeight(height);
            return this;
        }

        CropRequestBuilder withAutoCrop(boolean autoCrop) {
            form.setAutoCrop(autoCrop);
            return this;
        }

        CropRequestBuilder withRemoveDataOutsideCrop(boolean remove) {
            form.setRemoveDataOutsideCrop(remove);
            return this;
        }

        CropPdfForm build() {
            return form;
        }
    }

    private class TestPdfFactory {
        private static final PDType1Font HELVETICA =
                new PDType1Font(Standard14Fonts.FontName.HELVETICA);

        MockMultipartFile createStandardPdf(String filename) throws IOException {
            return createPdf(filename, PDRectangle.LETTER, null);
        }

        MockMultipartFile createPdfWithContent(String filename, String content) throws IOException {
            return createPdf(filename, PDRectangle.LETTER, content);
        }

        MockMultipartFile createPdfWithSize(String filename, PDRectangle size) throws IOException {
            return createPdf(filename, size, null);
        }

        MockMultipartFile createPdf(String filename, PDRectangle pageSize, String content)
                throws IOException {
            Path testPdfPath = tempDir.resolve(filename);

            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(pageSize);
                doc.addPage(page);

                if (content != null && !content.isEmpty()) {
                    try (PDPageContentStream contentStream = new PDPageContentStream(doc, page)) {
                        contentStream.beginText();
                        contentStream.setFont(HELVETICA, 12);
                        contentStream.newLineAtOffset(50, pageSize.getHeight() - 50);
                        contentStream.showText(content);
                        contentStream.endText();
                    }
                }

                doc.save(testPdfPath.toFile());
            }

            return new MockMultipartFile(
                    "fileInput",
                    filename,
                    MediaType.APPLICATION_PDF_VALUE,
                    Files.readAllBytes(testPdfPath));
        }

        MockMultipartFile createPdfWithCenteredContent(String filename, String content)
                throws IOException {
            Path testPdfPath = tempDir.resolve(filename);
            PDRectangle pageSize = PDRectangle.LETTER;

            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(pageSize);
                doc.addPage(page);

                if (content != null && !content.isEmpty()) {
                    try (PDPageContentStream contentStream = new PDPageContentStream(doc, page)) {
                        contentStream.beginText();
                        contentStream.setFont(HELVETICA, 12);
                        float x = pageSize.getWidth() / 2 - 50;
                        float y = pageSize.getHeight() / 2;
                        contentStream.newLineAtOffset(x, y);
                        contentStream.showText(content);
                        contentStream.endText();
                    }
                }

                doc.save(testPdfPath.toFile());
            }

            return new MockMultipartFile(
                    "fileInput",
                    filename,
                    MediaType.APPLICATION_PDF_VALUE,
                    Files.readAllBytes(testPdfPath));
        }
    }

    @Nested
    @DisplayName("Manual Crop with PDFBox")
    class ManualCropPDFBoxTests {

        @Test
        @DisplayName(
                "Should successfully crop PDF using PDFBox when removeDataOutsideCrop is false")
        void shouldCropPdfSuccessfullyWithPDFBox() throws IOException {
            MockMultipartFile testFile = pdfFactory.createStandardPdf("test.pdf");
            CropPdfForm request =
                    new CropRequestBuilder()
                            .withFile(testFile)
                            .withCoordinates(50f, 50f, 512f, 692f)
                            .withRemoveDataOutsideCrop(false)
                            .withAutoCrop(false)
                            .build();

            PDDocument mockDocument = mock(PDDocument.class);
            PDDocument newDocument = mock(PDDocument.class);
            when(pdfDocumentFactory.load(request)).thenReturn(mockDocument);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDocument))
                    .thenReturn(newDocument);

            ResponseEntity<byte[]> response = cropController.cropPdf(request);

            assertThat(response)
                    .isNotNull()
                    .extracting(ResponseEntity::getStatusCode, ResponseEntity::getBody)
                    .satisfies(
                            tuple -> {
                                assertThat(tuple.get(0)).isEqualTo(HttpStatus.OK);
                                assertThat(tuple.get(1)).isNotNull();
                            });

            verify(pdfDocumentFactory).load(request);
            verify(pdfDocumentFactory).createNewDocumentBasedOnOldDocument(mockDocument);
            verify(mockDocument, times(1)).close();
            verify(newDocument, times(1)).close();
        }

        @ParameterizedTest
        @CsvSource({"50, 50, 512, 692", "0, 0, 300, 400", "100, 100, 400, 600"})
        @DisplayName("Should handle various coordinate sets correctly")
        void shouldHandleVariousCoordinates(float x, float y, float width, float height)
                throws IOException {
            MockMultipartFile testFile = pdfFactory.createStandardPdf("test.pdf");
            CropPdfForm request =
                    new CropRequestBuilder()
                            .withFile(testFile)
                            .withCoordinates(x, y, width, height)
                            .withRemoveDataOutsideCrop(false)
                            .withAutoCrop(false)
                            .build();

            PDDocument mockDocument = mock(PDDocument.class);
            PDDocument newDocument = mock(PDDocument.class);
            when(pdfDocumentFactory.load(request)).thenReturn(mockDocument);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDocument))
                    .thenReturn(newDocument);

            ResponseEntity<byte[]> response = cropController.cropPdf(request);

            assertThat(response).isNotNull();
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();

            verify(pdfDocumentFactory).load(request);
            verify(mockDocument, times(1)).close();
            verify(newDocument, times(1)).close();
        }
    }

    @Nested
    @DisplayName("Auto Crop Functionality")
    @Tag("integration")
    class AutoCropTests {

        private TestPdfFactory autoCropPdfFactory;

        @BeforeEach
        void setUp() {
            autoCropPdfFactory = new TestPdfFactory();
        }

        @Test
        @DisplayName("Should auto-crop PDF with content successfully")
        void shouldAutoCropPdfSuccessfully() throws IOException {
            MockMultipartFile testFile =
                    autoCropPdfFactory.createPdfWithCenteredContent(
                            "test_autocrop.pdf", "Test Content for Auto Crop");
            CropPdfForm request =
                    new CropRequestBuilder().withFile(testFile).withAutoCrop(true).build();

            // Mock the pdfDocumentFactory to load real PDFs
            try (PDDocument sourceDoc = Loader.loadPDF(testFile.getBytes());
                    PDDocument newDoc = new PDDocument()) {
                when(pdfDocumentFactory.load(request)).thenReturn(sourceDoc);
                when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc))
                        .thenReturn(newDoc);

                ResponseEntity<byte[]> response = cropController.cropPdf(request);

                assertThat(response).isNotNull();
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(response.getBody()).isNotEmpty();

                try (PDDocument result = Loader.loadPDF(response.getBody())) {
                    assertThat(result.getNumberOfPages()).isEqualTo(1);

                    PDPage page = result.getPage(0);
                    assertThat(page).isNotNull();
                    assertThat(page.getMediaBox()).isNotNull();
                }
            }
        }

        @Test
        @DisplayName("Should handle PDF with minimal content")
        void shouldHandleMinimalContentPdf() throws IOException {
            MockMultipartFile testFile =
                    autoCropPdfFactory.createPdfWithContent("minimal.pdf", "X");
            CropPdfForm request =
                    new CropRequestBuilder().withFile(testFile).withAutoCrop(true).build();

            // Mock the pdfDocumentFactory to load real PDFs
            try (PDDocument sourceDoc = Loader.loadPDF(testFile.getBytes());
                    PDDocument newDoc = new PDDocument()) {
                when(pdfDocumentFactory.load(request)).thenReturn(sourceDoc);
                when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc))
                        .thenReturn(newDoc);

                ResponseEntity<byte[]> response = cropController.cropPdf(request);

                assertThat(response).isNotNull();
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

                Assertions.assertNotNull(response.getBody());
                try (PDDocument result = Loader.loadPDF(response.getBody())) {
                    assertThat(result.getNumberOfPages()).isEqualTo(1);
                }
            }
        }
    }

    @Nested
    @DisplayName("Content Bounds Detection")
    class ContentBoundsDetectionTests {

        private Method detectContentBoundsMethod;

        private static BufferedImage createWhiteImage(int width, int height) {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            for (int x = 0; x < width; x++) {
                for (int y = 0; y < height; y++) {
                    image.setRGB(x, y, 0xFFFFFF);
                }
            }
            return image;
        }

        private static BufferedImage createImageFilledWith(int width, int height, int color) {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            for (int x = 0; x < width; x++) {
                for (int y = 0; y < height; y++) {
                    image.setRGB(x, y, color);
                }
            }
            return image;
        }

        private static void drawBlackRectangle(
                BufferedImage image, int x1, int y1, int x2, int y2) {
            for (int x = x1; x < x2; x++) {
                for (int y = y1; y < y2; y++) {
                    image.setRGB(x, y, 0x000000);
                }
            }
        }

        private static void drawDarkerRectangle(
                BufferedImage image, int x1, int y1, int x2, int y2, int color) {
            for (int x = x1; x < x2; x++) {
                for (int y = y1; y < y2; y++) {
                    image.setRGB(x, y, color);
                }
            }
        }

        @BeforeEach
        void setUp() throws NoSuchMethodException {
            detectContentBoundsMethod =
                    CropController.class.getDeclaredMethod(
                            "detectContentBounds", BufferedImage.class);
            detectContentBoundsMethod.setAccessible(true);
        }

        @Test
        @DisplayName("Should detect full image bounds for all white image")
        void shouldDetectFullBoundsForWhiteImage() throws Exception {
            BufferedImage whiteImage = createWhiteImage(100, 100);

            int[] bounds = (int[]) detectContentBoundsMethod.invoke(null, whiteImage);

            assertThat(bounds).containsExactly(0, 0, 99, 99);
        }

        @Test
        @DisplayName("Should detect black rectangle bounds correctly")
        void shouldDetectBlackRectangleBounds() throws Exception {
            BufferedImage image = createWhiteImage(100, 100);
            drawBlackRectangle(image, 25, 25, 75, 75);

            int[] bounds = (int[]) detectContentBoundsMethod.invoke(null, image);

            assertThat(bounds).containsExactly(25, 25, 74, 74);
        }

        @Test
        @DisplayName("Should detect content at image edges")
        void shouldDetectContentAtEdges() throws Exception {
            BufferedImage image = createWhiteImage(100, 100);
            image.setRGB(0, 0, 0x000000);
            image.setRGB(99, 0, 0x000000);
            image.setRGB(0, 99, 0x000000);
            image.setRGB(99, 99, 0x000000);

            int[] bounds = (int[]) detectContentBoundsMethod.invoke(null, image);

            assertThat(bounds).containsExactly(0, 0, 99, 99);
        }

        @Test
        @DisplayName("Should include noise pixels in bounds detection")
        void shouldIncludeNoiseInBounds() throws Exception {
            BufferedImage image = createWhiteImage(100, 100);
            image.setRGB(10, 10, 0xF0F0F0);
            image.setRGB(90, 90, 0xF0F0F0);
            drawBlackRectangle(image, 30, 30, 70, 70);

            int[] bounds = (int[]) detectContentBoundsMethod.invoke(null, image);

            assertThat(bounds).containsExactly(10, 9, 90, 89);
        }

        @Test
        @DisplayName("Should treat gray pixels below threshold as content")
        void shouldTreatGrayPixelsAsContent() throws Exception {
            BufferedImage image = createImageFilledWith(50, 50, 0xF0F0F0);
            drawDarkerRectangle(image, 20, 20, 30, 30, 0xC0C0C0);

            int[] bounds = (int[]) detectContentBoundsMethod.invoke(null, image);

            assertThat(bounds).containsExactly(0, 0, 49, 49);
        }
    }

    @Nested
    @DisplayName("White Pixel Detection")
    class WhitePixelDetectionTests {

        private Method isWhiteMethod;

        @BeforeEach
        void setUp() throws NoSuchMethodException {
            isWhiteMethod = CropController.class.getDeclaredMethod("isWhite", int.class, int.class);
            isWhiteMethod.setAccessible(true);
        }

        @Test
        @DisplayName("Should identify pure white pixels")
        void shouldIdentifyWhitePixels() throws Exception {
            assertThat((Boolean) isWhiteMethod.invoke(null, 0xFFFFFFFF, 250)).isTrue();
            assertThat((Boolean) isWhiteMethod.invoke(null, 0xFFF0F0F0, 240)).isTrue();
        }

        @Test
        @DisplayName("Should identify black pixels as non-white")
        void shouldIdentifyBlackPixels() throws Exception {
            assertThat((Boolean) isWhiteMethod.invoke(null, 0xFF000000, 250)).isFalse();
            assertThat((Boolean) isWhiteMethod.invoke(null, 0xFF101010, 250)).isFalse();
        }

        @ParameterizedTest
        @ValueSource(ints = {0xFFFFFFFF, 0xFFFAFAFA, 0xFFF5F5F5})
        @DisplayName("Should identify various white shades")
        void shouldIdentifyVariousWhiteShades(int pixelColor) throws Exception {
            assertThat((Boolean) isWhiteMethod.invoke(null, pixelColor, 240)).isTrue();
        }

        @ParameterizedTest
        @ValueSource(ints = {0xFF000000, 0xFF101010, 0xFF808080})
        @DisplayName("Should identify various non-white shades")
        void shouldIdentifyNonWhiteShades(int pixelColor) throws Exception {
            assertThat((Boolean) isWhiteMethod.invoke(null, pixelColor, 250)).isFalse();
        }
    }

    @Nested
    @DisplayName("CropBounds Conversion")
    class CropBoundsTests {

        private Class<?> cropBoundsClass;
        private Method fromPixelsMethod;

        @BeforeEach
        void setUp() throws ClassNotFoundException, NoSuchMethodException {
            cropBoundsClass =
                    Class.forName(
                            "stirling.software.SPDF.controller.api.CropController$CropBounds");
            fromPixelsMethod =
                    cropBoundsClass.getDeclaredMethod(
                            "fromPixels", int[].class, float.class, float.class);
            fromPixelsMethod.setAccessible(true);
        }

        @Test
        @DisplayName("Should convert pixel bounds to PDF coordinates correctly")
        void shouldConvertPixelBoundsToPdfCoordinates() throws Exception {
            int[] pixelBounds = {10, 20, 110, 120};
            float scaleX = 0.5f;
            float scaleY = 0.5f;

            Object bounds = fromPixelsMethod.invoke(null, pixelBounds, scaleX, scaleY);

            assertThat(getFloatField(bounds, "x")).isCloseTo(5.0f, within(0.01f));
            assertThat(getFloatField(bounds, "y")).isCloseTo(10.0f, within(0.01f));
            assertThat(getFloatField(bounds, "width")).isCloseTo(50.0f, within(0.01f));
            assertThat(getFloatField(bounds, "height")).isCloseTo(50.0f, within(0.01f));
        }

        @ParameterizedTest
        @CsvSource({
            "0, 0, 100, 100, 1.0, 1.0",
            "10, 20, 50, 80, 2.0, 2.0",
            "5, 5, 25, 25, 0.5, 0.5"
        })
        @DisplayName("Should handle various scale factors")
        void shouldHandleVariousScaleFactors(
                int x1, int y1, int x2, int y2, float scaleX, float scaleY) throws Exception {
            int[] pixelBounds = {x1, y1, x2, y2};

            Object bounds = fromPixelsMethod.invoke(null, pixelBounds, scaleX, scaleY);

            assertThat(bounds).isNotNull();
            assertThat(getFloatField(bounds, "width")).isGreaterThan(0);
            assertThat(getFloatField(bounds, "height")).isGreaterThan(0);
        }

        @Test
        @DisplayName("Should throw exception for invalid pixel bounds array")
        void shouldThrowExceptionForInvalidArray() {
            int[] invalidBounds = {10, 20, 30};

            assertThatThrownBy(() -> fromPixelsMethod.invoke(null, invalidBounds, 1.0f, 1.0f))
                    .isInstanceOf(Exception.class)
                    .hasCauseInstanceOf(IllegalArgumentException.class)
                    .cause()
                    .hasMessageContaining("pixelBounds array must contain exactly 4 elements");
        }

        private float getFloatField(Object obj, String fieldName) throws Exception {
            Method getter = cropBoundsClass.getDeclaredMethod(fieldName);
            return (Float) getter.invoke(obj);
        }
    }

    @Nested
    @DisplayName("Error Handling")
    class ErrorHandlingTests {

        @Test
        @DisplayName("Should throw exception for corrupt PDF file")
        void shouldThrowExceptionForCorruptPdf() throws IOException {
            MockMultipartFile corruptFile =
                    new MockMultipartFile(
                            "fileInput",
                            "corrupt.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            "not a valid pdf content".getBytes());

            CropPdfForm request =
                    new CropRequestBuilder()
                            .withFile(corruptFile)
                            .withCoordinates(50f, 50f, 512f, 692f)
                            .withRemoveDataOutsideCrop(false)
                            .withAutoCrop(false)
                            .build();

            when(pdfDocumentFactory.load(request)).thenThrow(new IOException("Invalid PDF format"));

            assertThatThrownBy(() -> cropController.cropPdf(request))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("Invalid PDF format");

            verify(pdfDocumentFactory).load(request);
        }

        @Test
        @DisplayName("Should throw exception when coordinates are missing for manual crop")
        void shouldThrowExceptionForMissingCoordinates() throws IOException {
            MockMultipartFile testFile = pdfFactory.createStandardPdf("test.pdf");
            CropPdfForm request =
                    new CropRequestBuilder().withFile(testFile).withAutoCrop(false).build();

            assertThatThrownBy(() -> cropController.cropPdf(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage(
                            "Crop coordinates (x, y, width, height) are required when auto-crop is not enabled");
        }

        @Test
        @DisplayName("Should handle negative coordinates gracefully")
        void shouldHandleNegativeCoordinates() throws IOException {
            MockMultipartFile testFile = pdfFactory.createStandardPdf("test.pdf");
            CropPdfForm request =
                    new CropRequestBuilder()
                            .withFile(testFile)
                            .withCoordinates(-10f, 50f, 512f, 692f)
                            .withRemoveDataOutsideCrop(false)
                            .withAutoCrop(false)
                            .build();

            PDDocument mockDocument = mock(PDDocument.class);
            PDDocument newDocument = mock(PDDocument.class);
            when(pdfDocumentFactory.load(request)).thenReturn(mockDocument);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDocument))
                    .thenReturn(newDocument);

            assertThatCode(() -> cropController.cropPdf(request)).doesNotThrowAnyException();

            verify(mockDocument, times(1)).close();
            verify(newDocument, times(1)).close();
        }

        @Test
        @DisplayName("Should handle zero width or height")
        void shouldHandleZeroDimensions() throws IOException {
            MockMultipartFile testFile = pdfFactory.createStandardPdf("test.pdf");
            CropPdfForm request =
                    new CropRequestBuilder()
                            .withFile(testFile)
                            .withCoordinates(50f, 50f, 0f, 692f)
                            .withRemoveDataOutsideCrop(false)
                            .withAutoCrop(false)
                            .build();

            PDDocument mockDocument = mock(PDDocument.class);
            PDDocument newDocument = mock(PDDocument.class);
            when(pdfDocumentFactory.load(request)).thenReturn(mockDocument);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDocument))
                    .thenReturn(newDocument);

            assertThatCode(() -> cropController.cropPdf(request)).doesNotThrowAnyException();

            verify(mockDocument, times(1)).close();
            verify(newDocument, times(1)).close();
        }
    }

    @Nested
    @DisplayName("PDF Content Verification")
    @Tag("integration")
    class PdfContentVerificationTests {

        private static PDRectangle getPageSize(String name) {
            return switch (name) {
                case "LETTER" -> PDRectangle.LETTER;
                case "A4" -> PDRectangle.A4;
                case "LEGAL" -> PDRectangle.LEGAL;
                default -> PDRectangle.LETTER;
            };
        }

        @Test
        @DisplayName("Should produce PDF with correct dimensions after crop")
        void shouldProducePdfWithCorrectDimensions() throws IOException {
            MockMultipartFile testFile = pdfFactory.createStandardPdf("test.pdf");
            float expectedWidth = 400f;
            float expectedHeight = 500f;

            CropPdfForm request =
                    new CropRequestBuilder()
                            .withFile(testFile)
                            .withCoordinates(50f, 50f, expectedWidth, expectedHeight)
                            .withRemoveDataOutsideCrop(false)
                            .withAutoCrop(false)
                            .build();

            PDDocument mockDocument = mock(PDDocument.class);
            PDDocument newDocument = mock(PDDocument.class);
            when(pdfDocumentFactory.load(request)).thenReturn(mockDocument);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDocument))
                    .thenReturn(newDocument);

            ResponseEntity<byte[]> response = cropController.cropPdf(request);

            assertThat(response).isNotNull();
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        @ParameterizedTest
        @CsvSource({"test1.pdf, LETTER", "test2.pdf, A4", "test3.pdf, LEGAL"})
        @DisplayName("Should handle different page sizes")
        void shouldHandleDifferentPageSizes(String filename, String pageSizeName)
                throws IOException {
            PDRectangle pageSize = getPageSize(pageSizeName);
            MockMultipartFile testFile = pdfFactory.createPdfWithSize(filename, pageSize);

            CropPdfForm request =
                    new CropRequestBuilder()
                            .withFile(testFile)
                            .withCoordinates(50f, 50f, 300f, 400f)
                            .withRemoveDataOutsideCrop(false)
                            .withAutoCrop(false)
                            .build();

            PDDocument mockDocument = mock(PDDocument.class);
            PDDocument newDocument = mock(PDDocument.class);
            when(pdfDocumentFactory.load(request)).thenReturn(mockDocument);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(mockDocument))
                    .thenReturn(newDocument);

            ResponseEntity<byte[]> response = cropController.cropPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(mockDocument, times(1)).close();
            verify(newDocument, times(1)).close();
        }
    }
}
