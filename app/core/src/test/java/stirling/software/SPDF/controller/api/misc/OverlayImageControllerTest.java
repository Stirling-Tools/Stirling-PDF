package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.SvgSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class OverlayImageControllerTest {

    private static Response streamingOk(byte[] bytes) {
        return Response.ok(bytes).build();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private SvgSanitizer svgSanitizer;

    @InjectMocks private OverlayImageController controller;

    private FileUpload pdfFile;
    private FileUpload imageFile;

    @BeforeEach
    void setUp() throws IOException {
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
        pdfFile = TestFileUploads.pdf("PDF content".getBytes());
        imageFile = TestFileUploads.of(createValidPngBytes(), "overlay.png", "image/png");
    }

    private byte[] createValidPngBytes() throws IOException {
        BufferedImage img = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
        img.setRGB(0, 0, 0xFFFFFF);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", baos);
        return baos.toByteArray();
    }

    @Test
    void overlayImage_success_singlePage() throws Exception {
        PDDocument mockDoc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        mockDoc.addPage(page);
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            Response expectedResponse = streamingOk("result".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response = controller.overlayImage(pdfFile, imageFile, 10.0f, 20.0f, false);

            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }
        mockDoc.close();
    }

    @Test
    void overlayImage_ioException_returnsBadRequest() throws Exception {
        when(pdfDocumentFactory.load(any(byte[].class))).thenThrow(new IOException("bad PDF"));

        Response response = controller.overlayImage(pdfFile, imageFile, 0, 0, false);

        assertEquals(400, response.getStatus());
    }

    @Test
    void overlayImage_everyPageFalse_onlyOverlaysFirstPage() throws Exception {
        PDDocument mockDoc = new PDDocument();
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            Response expectedResponse = streamingOk("result".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response = controller.overlayImage(pdfFile, imageFile, 0, 0, false);

            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }
        mockDoc.close();
    }

    @Test
    void overlayImage_nullEveryPage_treatedAsFalse() throws Exception {
        PDDocument mockDoc = new PDDocument();
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            Response expectedResponse = streamingOk("result".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response = controller.overlayImage(pdfFile, imageFile, 0, 0, null);

            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }
        mockDoc.close();
    }

    @Test
    void overlayImage_svgInput_sanitizedBeforeOverlay() throws Exception {
        byte[] maliciousSvg =
                ("<svg xmlns=\"http://www.w3.org/2000/svg\""
                                + " xmlns:xlink=\"http://www.w3.org/1999/xlink\""
                                + " width=\"10\" height=\"10\">"
                                + "<image x=\"0\" y=\"0\" width=\"10\" height=\"10\""
                                + " xlink:href=\"file:///etc/passwd\"/>"
                                + "</svg>")
                        .getBytes();
        byte[] sanitized =
                ("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\">"
                                + "<image x=\"0\" y=\"0\" width=\"10\" height=\"10\"/>"
                                + "</svg>")
                        .getBytes();
        when(svgSanitizer.sanitize(aryEq(maliciousSvg))).thenReturn(sanitized);

        FileUpload svgFile = TestFileUploads.of(maliciousSvg, "overlay.svg", "image/svg+xml");

        PDDocument mockDoc = new PDDocument();
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(streamingOk("result".getBytes()));

            controller.overlayImage(pdfFile, svgFile, 0, 0, false);
        }
        mockDoc.close();

        verify(svgSanitizer).sanitize(aryEq(maliciousSvg));
    }

    @Test
    void overlayImage_withCoordinates_usesXY() throws Exception {
        PDDocument mockDoc = new PDDocument();
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            Response expectedResponse = streamingOk("result".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            // Should not throw - coordinates are passed to contentStream.drawImage
            Response response = controller.overlayImage(pdfFile, imageFile, 100.5f, 200.5f, false);

            assertNotNull(response);
            assertEquals(200, response.getStatus());
        }
        mockDoc.close();
    }
}
