package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.ConvertToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertImgPDFControllerTest {
    private static ResponseEntity<StreamingResponseBody> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(out -> out.write(bytes));
    }

    private static byte[] drainBody(ResponseEntity<StreamingResponseBody> response)
            throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        response.getBody().writeTo(baos);
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private ConvertImgPDFController controller;

    @Test
    void convertToPdf_singleImage() throws Exception {
        byte[] imgContent = "fake-image".getBytes();
        byte[] pdfBytes = "pdf-output".getBytes();

        MockMultipartFile imgFile =
                new MockMultipartFile("fileInput", "photo.jpg", "image/jpeg", imgContent);

        ConvertToPdfRequest request = new ConvertToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {imgFile});
        request.setFitOption("fillPage");
        request.setColorType("color");
        request.setAutoRotate(false);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(pdfBytes);

        try (MockedStatic<PdfUtils> puMock = Mockito.mockStatic(PdfUtils.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            puMock.when(
                            () ->
                                    PdfUtils.imageToPdf(
                                            any(MockMultipartFile[].class),
                                            eq("fillPage"),
                                            eq(false),
                                            eq("color"),
                                            eq(pdfDocumentFactory)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("photo.jpg", "_converted.pdf"))
                    .thenReturn("photo_converted.pdf");

            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "photo_converted.pdf"))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = controller.convertToPdf(request);

            assertSame(expectedResponse, response);
        }
    }

    @Test
    void convertToPdf_nullFitOptionDefaultsToFillPage() throws Exception {
        byte[] imgContent = "fake-image".getBytes();
        byte[] pdfBytes = "pdf-output".getBytes();

        MockMultipartFile imgFile =
                new MockMultipartFile("fileInput", "photo.png", "image/png", imgContent);

        ConvertToPdfRequest request = new ConvertToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {imgFile});
        request.setFitOption(null);
        request.setColorType(null);
        request.setAutoRotate(null);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(pdfBytes);

        try (MockedStatic<PdfUtils> puMock = Mockito.mockStatic(PdfUtils.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            puMock.when(
                            () ->
                                    PdfUtils.imageToPdf(
                                            any(MockMultipartFile[].class),
                                            eq("fillPage"),
                                            eq(false),
                                            eq("color"),
                                            eq(pdfDocumentFactory)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("photo.png", "_converted.pdf"))
                    .thenReturn("photo_converted.pdf");

            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "photo_converted.pdf"))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = controller.convertToPdf(request);

            assertSame(expectedResponse, response);
        }
    }

    @Test
    void convertToPdf_withAutoRotate() throws Exception {
        byte[] imgContent = "fake-image".getBytes();
        byte[] pdfBytes = "pdf-output".getBytes();

        MockMultipartFile imgFile =
                new MockMultipartFile("fileInput", "photo.jpg", "image/jpeg", imgContent);

        ConvertToPdfRequest request = new ConvertToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {imgFile});
        request.setFitOption("fitDocumentToImage");
        request.setColorType("greyscale");
        request.setAutoRotate(true);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(pdfBytes);

        try (MockedStatic<PdfUtils> puMock = Mockito.mockStatic(PdfUtils.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            puMock.when(
                            () ->
                                    PdfUtils.imageToPdf(
                                            any(MockMultipartFile[].class),
                                            eq("fitDocumentToImage"),
                                            eq(true),
                                            eq("greyscale"),
                                            eq(pdfDocumentFactory)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("photo.jpg", "_converted.pdf"))
                    .thenReturn("photo_converted.pdf");

            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "photo_converted.pdf"))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = controller.convertToPdf(request);

            assertSame(expectedResponse, response);
        }
    }

    @Test
    void controllerIsConstructed() {
        assertNotNull(controller);
    }
}
