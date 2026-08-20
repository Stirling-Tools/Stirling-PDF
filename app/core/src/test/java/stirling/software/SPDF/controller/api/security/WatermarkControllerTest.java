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
import org.jboss.resteasy.reactive.multipart.FileUpload;
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

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("WatermarkController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WatermarkControllerTest {

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
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile,
                            null,
                            "text",
                            "CONFIDENTIAL",
                            null,
                            "roman",
                            30f,
                            45f,
                            0.5f,
                            50,
                            50,
                            "#d3d3d3",
                            false);

            assertNotNull(response.getEntity());
            assertEquals(200, response.getStatus());
        }

        @Test
        @DisplayName("Should handle color without hash prefix")
        void testAddTextWatermark_ColorWithoutHash() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile, null, "text", "DRAFT", null, "roman", 20f, 0f, 0.3f, 100, 100,
                            "ff0000", false);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle invalid color string gracefully")
        void testAddTextWatermark_InvalidColor() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile,
                            null,
                            "text",
                            "TEST",
                            null,
                            "roman",
                            20f,
                            0f,
                            0.5f,
                            50,
                            50,
                            "not-a-color",
                            false);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle multi-line watermark text")
        void testAddTextWatermark_MultiLine() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile,
                            null,
                            "text",
                            "Line1\\nLine2",
                            null,
                            "roman",
                            20f,
                            0f,
                            0.5f,
                            50,
                            50,
                            "#000000",
                            false);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle zero rotation")
        void testAddTextWatermark_ZeroRotation() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile,
                            null,
                            "text",
                            "NO ROTATION",
                            null,
                            "roman",
                            20f,
                            0f,
                            0.5f,
                            50,
                            50,
                            "#d3d3d3",
                            false);
            assertNotNull(response.getEntity());
        }
    }

    @Nested
    @DisplayName("Security Validation Tests")
    class SecurityTests {

        @Test
        @DisplayName("Should reject PDF filename with path traversal")
        void testWatermark_PathTraversalInPdfFilename() throws Exception {
            FileUpload pdfFile =
                    TestFileUploads.of(simplePdfBytes, "../etc/passwd.pdf", "application/pdf");

            assertThrows(
                    SecurityException.class,
                    () ->
                            watermarkController.addWatermark(
                                    pdfFile, null, "text", "test", null, "roman", 20f, 0f, 0.5f, 50,
                                    50, "#d3d3d3", false));
        }

        @Test
        @DisplayName("Should reject PDF filename starting with /")
        void testWatermark_AbsolutePathInPdfFilename() throws Exception {
            FileUpload pdfFile =
                    TestFileUploads.of(simplePdfBytes, "/etc/passwd", "application/pdf");

            assertThrows(
                    SecurityException.class,
                    () ->
                            watermarkController.addWatermark(
                                    pdfFile, null, "text", "test", null, "roman", 20f, 0f, 0.5f, 50,
                                    50, "#d3d3d3", false));
        }

        @Test
        @DisplayName("Should reject watermark image with path traversal")
        void testWatermark_PathTraversalInWatermarkImage() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);
            FileUpload watermarkImage =
                    TestFileUploads.of(new byte[] {1, 2, 3}, "../malicious.png", "image/png");

            assertThrows(
                    SecurityException.class,
                    () ->
                            watermarkController.addWatermark(
                                    pdfFile,
                                    null,
                                    "image",
                                    null,
                                    watermarkImage,
                                    "roman",
                                    20f,
                                    0f,
                                    0.5f,
                                    50,
                                    50,
                                    "#d3d3d3",
                                    false));
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

            FileUpload pdfFile = TestFileUploads.of(multiPagePdf, "multi.pdf", "application/pdf");

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(multiPagePdf));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile,
                            null,
                            "text",
                            "WATERMARK",
                            null,
                            "roman",
                            30f,
                            45f,
                            0.5f,
                            50,
                            50,
                            "#d3d3d3",
                            false);
            assertNotNull(response.getEntity());
        }
    }

    @Nested
    @DisplayName("Edge Case Tests")
    class EdgeCaseTests {

        @Test
        @DisplayName("Should handle null watermark image filename")
        void testWatermark_NullImageFilename() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);
            FileUpload watermarkImage = TestFileUploads.of(new byte[] {1, 2, 3}, null, "image/png");

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile,
                            null,
                            "text",
                            "TEST",
                            watermarkImage,
                            "roman",
                            20f,
                            0f,
                            0.5f,
                            50,
                            50,
                            "#d3d3d3",
                            false);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle null PDF filename")
        void testWatermark_NullPdfFilename() throws Exception {
            FileUpload pdfFile = TestFileUploads.of(simplePdfBytes, null, "application/pdf");

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile, null, "text", "TEST", null, "roman", 20f, 0f, 0.5f, 50, 50,
                            "#d3d3d3", false);
            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should handle max opacity")
        void testAddTextWatermark_MaxOpacity() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    watermarkController.addWatermark(
                            pdfFile, null, "text", "OPAQUE", null, "roman", 20f, 0f, 1.0f, 50, 50,
                            "#d3d3d3", false);
            assertNotNull(response.getEntity());
        }
    }
}
