package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

import java.util.List;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertImgPDFControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private ConvertImgPDFController controller;

    @Test
    void convertToPdf_singleImage() throws Exception {
        byte[] imgContent = "fake-image".getBytes();
        byte[] pdfBytes = "pdf-output".getBytes();

        FileUpload imgFile = TestFileUploads.of(imgContent, "photo.jpg", "image/jpeg");

        Response expectedResponse = Response.ok(pdfBytes).build();

        try (MockedStatic<PdfUtils> puMock = Mockito.mockStatic(PdfUtils.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            puMock.when(
                            () ->
                                    PdfUtils.imageToPdf(
                                            any(MultipartFile[].class),
                                            eq("fillPage"),
                                            eq(false),
                                            eq("color"),
                                            eq(pdfDocumentFactory)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("photo.jpg", "_converted.pdf"))
                    .thenReturn("photo_converted.pdf");

            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "photo_converted.pdf"))
                    .thenReturn(expectedResponse);

            Response response =
                    controller.convertToPdf(List.of(imgFile), "fillPage", "color", false);

            assertSame(expectedResponse, response);
        }
    }

    @Test
    void convertToPdf_nullFitOptionDefaultsToFillPage() throws Exception {
        byte[] imgContent = "fake-image".getBytes();
        byte[] pdfBytes = "pdf-output".getBytes();

        FileUpload imgFile = TestFileUploads.of(imgContent, "photo.png", "image/png");

        Response expectedResponse = Response.ok(pdfBytes).build();

        try (MockedStatic<PdfUtils> puMock = Mockito.mockStatic(PdfUtils.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            puMock.when(
                            () ->
                                    PdfUtils.imageToPdf(
                                            any(MultipartFile[].class),
                                            eq("fillPage"),
                                            eq(false),
                                            eq("color"),
                                            eq(pdfDocumentFactory)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("photo.png", "_converted.pdf"))
                    .thenReturn("photo_converted.pdf");

            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "photo_converted.pdf"))
                    .thenReturn(expectedResponse);

            Response response = controller.convertToPdf(List.of(imgFile), null, null, null);

            assertSame(expectedResponse, response);
        }
    }

    @Test
    void convertToPdf_withAutoRotate() throws Exception {
        byte[] imgContent = "fake-image".getBytes();
        byte[] pdfBytes = "pdf-output".getBytes();

        FileUpload imgFile = TestFileUploads.of(imgContent, "photo.jpg", "image/jpeg");

        Response expectedResponse = Response.ok(pdfBytes).build();

        try (MockedStatic<PdfUtils> puMock = Mockito.mockStatic(PdfUtils.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            puMock.when(
                            () ->
                                    PdfUtils.imageToPdf(
                                            any(MultipartFile[].class),
                                            eq("fitDocumentToImage"),
                                            eq(true),
                                            eq("greyscale"),
                                            eq(pdfDocumentFactory)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("photo.jpg", "_converted.pdf"))
                    .thenReturn("photo_converted.pdf");

            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "photo_converted.pdf"))
                    .thenReturn(expectedResponse);

            Response response =
                    controller.convertToPdf(
                            List.of(imgFile), "fitDocumentToImage", "greyscale", true);

            assertSame(expectedResponse, response);
        }
    }

    @Test
    void controllerIsConstructed() {
        assertNotNull(controller);
    }
}
