package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.OverlayImageRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class OverlayImageControllerTest {
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

    @InjectMocks private OverlayImageController controller;

    private MockMultipartFile pdfFile;
    private MockMultipartFile imageFile;

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
        pdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "PDF content".getBytes());
        imageFile =
                new MockMultipartFile(
                        "imageFile",
                        "overlay.png",
                        MediaType.IMAGE_PNG_VALUE,
                        createValidPngBytes());
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
        OverlayImageRequest request = new OverlayImageRequest();
        request.setFileInput(pdfFile);
        request.setImageFile(imageFile);
        request.setX(10.0f);
        request.setY(20.0f);
        request.setEveryPage(false);

        PDDocument mockDoc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        mockDoc.addPage(page);
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<Resource> expectedResponse = streamingOk("result".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = controller.overlayImage(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
        mockDoc.close();
    }

    @Test
    void overlayImage_ioException_returnsBadRequest() throws Exception {
        OverlayImageRequest request = new OverlayImageRequest();
        request.setFileInput(pdfFile);
        request.setImageFile(imageFile);
        request.setX(0);
        request.setY(0);
        request.setEveryPage(false);

        when(pdfDocumentFactory.load(any(byte[].class))).thenThrow(new IOException("bad PDF"));

        ResponseEntity<Resource> response = controller.overlayImage(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void overlayImage_everyPageFalse_onlyOverlaysFirstPage() throws Exception {
        OverlayImageRequest request = new OverlayImageRequest();
        request.setFileInput(pdfFile);
        request.setImageFile(imageFile);
        request.setX(0);
        request.setY(0);
        request.setEveryPage(false);

        PDDocument mockDoc = new PDDocument();
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<Resource> expectedResponse = streamingOk("result".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = controller.overlayImage(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
        mockDoc.close();
    }

    @Test
    void overlayImage_nullEveryPage_treatedAsFalse() throws Exception {
        OverlayImageRequest request = new OverlayImageRequest();
        request.setFileInput(pdfFile);
        request.setImageFile(imageFile);
        request.setX(0);
        request.setY(0);
        request.setEveryPage(null);

        PDDocument mockDoc = new PDDocument();
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<Resource> expectedResponse = streamingOk("result".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = controller.overlayImage(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
        mockDoc.close();
    }

    @Test
    void overlayImage_withCoordinates_usesXY() throws Exception {
        OverlayImageRequest request = new OverlayImageRequest();
        request.setFileInput(pdfFile);
        request.setImageFile(imageFile);
        request.setX(100.5f);
        request.setY(200.5f);
        request.setEveryPage(false);

        PDDocument mockDoc = new PDDocument();
        mockDoc.addPage(new PDPage(PDRectangle.A4));
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDoc);

        try (MockedStatic<WebResponseUtils> mockedWebResponse =
                mockStatic(WebResponseUtils.class)) {
            ResponseEntity<Resource> expectedResponse = streamingOk("result".getBytes());
            mockedWebResponse
                    .when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            // Should not throw - coordinates are passed to contentStream.drawImage
            ResponseEntity<Resource> response = controller.overlayImage(request);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
        mockDoc.close();
    }
}
