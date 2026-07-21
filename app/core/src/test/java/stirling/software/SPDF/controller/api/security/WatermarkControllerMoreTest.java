package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
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

/**
 * Gap coverage for {@link WatermarkController}: the image watermark path, the convert-to-image
 * branch, and a non-roman alphabet font path not exercised by WatermarkControllerTest.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("WatermarkController image/convert/alphabet branches")
class WatermarkControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private WatermarkController controller;

    private byte[] simplePdfBytes;
    private byte[] pngBytes;

    @BeforeEach
    void setUp() throws Exception {
        controller = new WatermarkController(pdfDocumentFactory, tempFileManager);

        when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("wm", inv.<String>getArgument(0)).toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });

        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.save(baos);
            simplePdfBytes = baos.toByteArray();
        }

        BufferedImage img = new BufferedImage(40, 40, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, 40, 40);
        g.dispose();
        ByteArrayOutputStream imgBaos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", imgBaos);
        pngBytes = imgBaos.toByteArray();

        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));
    }

    private AddWatermarkRequest baseRequest() {
        AddWatermarkRequest request = new AddWatermarkRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "in.pdf", MediaType.APPLICATION_PDF_VALUE, simplePdfBytes));
        request.setAlphabet("roman");
        request.setFontSize(30);
        request.setRotation(0);
        request.setOpacity(0.5f);
        request.setWidthSpacer(50);
        request.setHeightSpacer(50);
        request.setCustomColor("#d3d3d3");
        request.setConvertPDFToImage(false);
        return request;
    }

    @Nested
    @DisplayName("image watermark")
    class ImageWatermark {

        @Test
        @DisplayName("tiles an image watermark across the page")
        void imageWatermarkSucceeds() throws Exception {
            AddWatermarkRequest request = baseRequest();
            request.setWatermarkType("image");
            request.setWatermarkImage(
                    new MockMultipartFile("watermarkImage", "wm.png", "image/png", pngBytes));

            ResponseEntity<Resource> response = controller.addWatermark(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().contentLength() > 0);
        }

        @Test
        @DisplayName("image watermark with rotation succeeds")
        void imageWatermarkWithRotation() throws Exception {
            AddWatermarkRequest request = baseRequest();
            request.setWatermarkType("image");
            request.setRotation(30);
            request.setWatermarkImage(
                    new MockMultipartFile("watermarkImage", "wm.png", "image/png", pngBytes));

            ResponseEntity<Resource> response = controller.addWatermark(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    @DisplayName("convertPDFToImage flattens the watermarked PDF to an image PDF")
    void convertToImageBranch() throws Exception {
        AddWatermarkRequest request = baseRequest();
        request.setWatermarkType("text");
        request.setWatermarkText("FLATTEN");
        request.setConvertPDFToImage(true);

        // Stub the heavy render step; we only need the convert-to-image branch to be taken.
        PDDocument flattened = new PDDocument();
        flattened.addPage(new PDPage(PDRectangle.A4));
        try (MockedStatic<stirling.software.common.util.PdfUtils> pu =
                Mockito.mockStatic(stirling.software.common.util.PdfUtils.class)) {
            pu.when(() -> stirling.software.common.util.PdfUtils.convertPdfToPdfImage(any()))
                    .thenReturn(flattened);

            ResponseEntity<Resource> response = controller.addWatermark(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().contentLength() > 0);
        }
    }

    @Test
    @DisplayName("non-roman alphabet loads the matching embedded font")
    void arabicAlphabet() throws Exception {
        AddWatermarkRequest request = baseRequest();
        request.setWatermarkType("text");
        // Arabic letters that exist in NotoSansArabic; Latin would have no glyph in that font.
        request.setWatermarkText("ابج");
        request.setAlphabet("arabic");

        ResponseEntity<Resource> response = controller.addWatermark(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }

    @Test
    @DisplayName("unknown watermark type leaves the document otherwise unmodified")
    void unknownTypeNoOp() throws Exception {
        AddWatermarkRequest request = baseRequest();
        request.setWatermarkType("nonsense");
        request.setWatermarkText("ignored");

        ResponseEntity<Resource> response = controller.addWatermark(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @DisplayName("path traversal in the PDF filename is rejected")
    void pathTraversalRejected() {
        AddWatermarkRequest request = baseRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput",
                        "../evil.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        simplePdfBytes));
        request.setWatermarkType("text");
        request.setWatermarkText("x");

        assertThrows(SecurityException.class, () -> controller.addWatermark(request));
    }
}
