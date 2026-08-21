package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.AddWatermarkRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("WatermarkController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WatermarkControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private WatermarkController watermarkController;

    private byte[] simplePdfBytes;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("Test content");
                cs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            simplePdfBytes = baos.toByteArray();
        }
    }

    @Nested
    @DisplayName("Text Watermark Tests")
    class TextWatermarkTests {

        @Test
        @DisplayName("Should add text watermark with default alphabet")
        void testAddTextWatermark_DefaultAlphabet() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("CONFIDENTIAL");
            request.setAlphabet("roman");
            request.setFontSize(30);
            request.setRotation(45);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);

            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("Should handle color without hash prefix")
        void testAddTextWatermark_ColorWithoutHash() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("DRAFT");
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.3f);
            request.setWidthSpacer(100);
            request.setHeightSpacer(100);
            request.setCustomColor("ff0000");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle invalid color string gracefully")
        void testAddTextWatermark_InvalidColor() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("TEST");
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("not-a-color");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle multi-line watermark text")
        void testAddTextWatermark_MultiLine() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("Line1\\nLine2");
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#000000");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle zero rotation")
        void testAddTextWatermark_ZeroRotation() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("NO ROTATION");
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);
            assertNotNull(response.getBody());
        }
    }

    @Nested
    @DisplayName("Security Validation Tests")
    class SecurityTests {

        @Test
        @DisplayName("Should reject PDF filename with path traversal")
        void testWatermark_PathTraversalInPdfFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "../etc/passwd.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("test");
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            assertThrows(SecurityException.class, () -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should reject PDF filename starting with /")
        void testWatermark_AbsolutePathInPdfFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "/etc/passwd",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("test");
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            assertThrows(SecurityException.class, () -> watermarkController.addWatermark(request));
        }

        @Test
        @DisplayName("Should reject watermark image with path traversal")
        void testWatermark_PathTraversalInWatermarkImage() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            MockMultipartFile watermarkImage =
                    new MockMultipartFile(
                            "watermarkImage",
                            "../malicious.png",
                            "image/png",
                            new byte[] {1, 2, 3});

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("image");
            request.setWatermarkImage(watermarkImage);
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            assertThrows(SecurityException.class, () -> watermarkController.addWatermark(request));
        }
    }

    @Nested
    @DisplayName("Multi-Page Tests")
    class MultiPageTests {

        @Test
        @DisplayName("Should add watermark to multi-page PDF")
        void testAddTextWatermark_MultiPage() throws Exception {
            byte[] multiPagePdf;
            try (PDDocument doc = new PDDocument()) {
                for (int i = 0; i < 3; i++) {
                    PDPage page = new PDPage(PDRectangle.A4);
                    doc.addPage(page);
                }
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                multiPagePdf = baos.toByteArray();
            }

            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "multi.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            multiPagePdf);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("WATERMARK");
            request.setAlphabet("roman");
            request.setFontSize(30);
            request.setRotation(45);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(multiPagePdf));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);
            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
        }
    }

    @Nested
    @DisplayName("Edge Case Tests")
    class EdgeCaseTests {

        @Test
        @DisplayName("Should handle null watermark image filename")
        void testWatermark_NullImageFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            MockMultipartFile watermarkImage =
                    new MockMultipartFile(
                            "watermarkImage", null, "image/png", new byte[] {1, 2, 3});

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("TEST");
            request.setWatermarkImage(watermarkImage);
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle null PDF filename")
        void testWatermark_NullPdfFilename() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", null, MediaType.APPLICATION_PDF_VALUE, simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("TEST");
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(0.5f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);
            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should handle max opacity")
        void testAddTextWatermark_MaxOpacity() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            AddWatermarkRequest request = new AddWatermarkRequest();
            request.setFileInput(pdfFile);
            request.setWatermarkType("text");
            request.setWatermarkText("OPAQUE");
            request.setAlphabet("roman");
            request.setFontSize(20);
            request.setRotation(0);
            request.setOpacity(1.0f);
            request.setWidthSpacer(50);
            request.setHeightSpacer(50);
            request.setCustomColor("#d3d3d3");
            request.setConvertPDFToImage(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<Resource> response = watermarkController.addWatermark(request);
            assertNotNull(response.getBody());
        }
    }
}
