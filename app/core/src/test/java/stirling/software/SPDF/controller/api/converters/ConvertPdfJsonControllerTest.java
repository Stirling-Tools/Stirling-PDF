package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertPdfJsonControllerTest {
    private static ResponseEntity<StreamingResponseBody> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(out -> out.write(bytes));
    }

    private static byte[] drainBody(ResponseEntity<StreamingResponseBody> response)
            throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        response.getBody().writeTo(baos);
        return baos.toByteArray();
    }

    @Mock private PdfJsonConversionService pdfJsonConversionService;

    @InjectMocks private ConvertPdfJsonController controller;

    @Test
    void convertPdfToJson_nullFileInputThrows() {
        PDFFile request = new PDFFile();
        request.setFileInput(null);

        assertThrows(Exception.class, () -> controller.convertPdfToJson(request, false));
    }

    @Test
    void convertPdfToJson_success() throws Exception {
        byte[] jsonBytes = "{\"pages\":[]}".getBytes();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        PDFFile request = new PDFFile();
        request.setFileInput(pdfFile);

        when(pdfJsonConversionService.convertPdfToJson(pdfFile, false)).thenReturn(jsonBytes);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(jsonBytes);

        try (MockedStatic<WebResponseUtils> wrMock = Mockito.mockStatic(WebResponseUtils.class)) {
            wrMock.when(
                            () ->
                                    WebResponseUtils.bytesToWebResponse(
                                            jsonBytes, "doc.json", MediaType.APPLICATION_JSON))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response =
                    controller.convertPdfToJson(request, false);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void convertPdfToJson_lightweightMode() throws Exception {
        byte[] jsonBytes = "{\"pages\":[]}".getBytes();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        PDFFile request = new PDFFile();
        request.setFileInput(pdfFile);

        when(pdfJsonConversionService.convertPdfToJson(pdfFile, true)).thenReturn(jsonBytes);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(jsonBytes);

        try (MockedStatic<WebResponseUtils> wrMock = Mockito.mockStatic(WebResponseUtils.class)) {
            wrMock.when(
                            () ->
                                    WebResponseUtils.bytesToWebResponse(
                                            jsonBytes, "doc.json", MediaType.APPLICATION_JSON))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response =
                    controller.convertPdfToJson(request, true);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            verify(pdfJsonConversionService).convertPdfToJson(pdfFile, true);
        }
    }

    @Test
    void convertJsonToPdf_nullFileInputThrows() {
        GeneralFile request = new GeneralFile();
        request.setFileInput(null);

        assertThrows(Exception.class, () -> controller.convertJsonToPdf(request));
    }

    @Test
    void convertJsonToPdf_success() throws Exception {
        byte[] pdfBytes = "pdf-content".getBytes();
        MockMultipartFile jsonFile =
                new MockMultipartFile(
                        "fileInput", "doc.json", "application/json", "{\"pages\":[]}".getBytes());
        GeneralFile request = new GeneralFile();
        request.setFileInput(jsonFile);

        when(pdfJsonConversionService.convertJsonToPdf(jsonFile)).thenReturn(pdfBytes);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(pdfBytes);

        try (MockedStatic<WebResponseUtils> wrMock = Mockito.mockStatic(WebResponseUtils.class)) {
            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "doc.pdf"))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = controller.convertJsonToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void extractPdfMetadata_nullFileInputThrows() {
        PDFFile request = new PDFFile();
        request.setFileInput(null);

        assertThrows(Exception.class, () -> controller.extractPdfMetadata(request));
    }

    @Test
    void extractPdfMetadata_success() throws Exception {
        byte[] jsonBytes = "{\"metadata\":{}}".getBytes();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        PDFFile request = new PDFFile();
        request.setFileInput(pdfFile);

        when(pdfJsonConversionService.extractDocumentMetadata(eq(pdfFile), any(String.class)))
                .thenReturn(jsonBytes);

        ResponseEntity<StreamingResponseBody> response = controller.extractPdfMetadata(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
        assertNotNull(response.getHeaders().getFirst("X-Job-Id"));
    }

    @Test
    void clearCache_success() {
        String jobId = "test-job-id";

        ResponseEntity<Void> response = controller.clearCache(jobId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(pdfJsonConversionService).clearCachedDocument(jobId);
    }

    @Test
    void extractSinglePage_success() throws Exception {
        byte[] jsonBytes = "{\"content\":[]}".getBytes();
        String jobId = "test-job-id";

        when(pdfJsonConversionService.extractSinglePage(jobId, 1)).thenReturn(jsonBytes);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(jsonBytes);

        try (MockedStatic<WebResponseUtils> wrMock = Mockito.mockStatic(WebResponseUtils.class)) {
            wrMock.when(
                            () ->
                                    WebResponseUtils.bytesToWebResponse(
                                            jsonBytes, "page_1.json", MediaType.APPLICATION_JSON))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = controller.extractSinglePage(jobId, 1);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void extractPageFonts_success() throws Exception {
        byte[] jsonBytes = "{\"fonts\":[]}".getBytes();
        String jobId = "test-job-id";

        when(pdfJsonConversionService.extractPageFonts(jobId, 1)).thenReturn(jsonBytes);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(jsonBytes);

        try (MockedStatic<WebResponseUtils> wrMock = Mockito.mockStatic(WebResponseUtils.class)) {
            wrMock.when(
                            () ->
                                    WebResponseUtils.bytesToWebResponse(
                                            jsonBytes,
                                            "page_fonts_1.json",
                                            MediaType.APPLICATION_JSON))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = controller.extractPageFonts(jobId, 1);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }
}
