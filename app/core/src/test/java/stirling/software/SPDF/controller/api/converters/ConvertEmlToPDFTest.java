package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

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

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.EmlToPdf;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertEmlToPDFTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private CustomHtmlSanitizer customHtmlSanitizer;

    @InjectMocks private ConvertEmlToPDF controller;

    @Test
    void convertEmlToPdf_emptyFileReturnsBadRequest() {
        MockMultipartFile emptyFile =
                new MockMultipartFile("fileInput", "test.eml", "message/rfc822", new byte[0]);

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(emptyFile);

        ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(
                new String(response.getBody(), StandardCharsets.UTF_8)
                        .contains("No file provided"));
    }

    @Test
    void convertEmlToPdf_nullFilenameReturnsBadRequest() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", null, "message/rfc822", "content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);

        ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(
                new String(response.getBody(), StandardCharsets.UTF_8).contains("valid filename"));
    }

    @Test
    void convertEmlToPdf_emptyFilenameReturnsBadRequest() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "   ", "message/rfc822", "content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);

        ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void convertEmlToPdf_invalidFileTypeReturnsBadRequest() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "test.txt", "text/plain", "content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);

        ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(
                new String(response.getBody(), StandardCharsets.UTF_8)
                        .contains("valid EML or MSG"));
    }

    @Test
    void convertEmlToPdf_successfulPdfConversion() throws Exception {
        byte[] pdfBytes = "fake-pdf-content".getBytes();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.eml", "message/rfc822", "email content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(pdfBytes);

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToPdf(
                                            eq("/usr/bin/weasyprint"),
                                            eq(request),
                                            any(byte[].class),
                                            eq("test.eml"),
                                            eq(pdfDocumentFactory),
                                            eq(tempFileManager),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(pdfBytes);

            wrMock.when(
                            () ->
                                    WebResponseUtils.bytesToWebResponse(
                                            pdfBytes, "test.eml.pdf", MediaType.APPLICATION_PDF))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertArrayEquals(pdfBytes, response.getBody());
        }
    }

    @Test
    void convertEmlToPdf_downloadHtmlMode() throws Exception {
        String htmlContent = "<html><body>email</body></html>";
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.eml", "message/rfc822", "email content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);
        request.setDownloadHtml(true);

        ResponseEntity<byte[]> expectedResponse =
                ResponseEntity.ok(htmlContent.getBytes(StandardCharsets.UTF_8));

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToHtml(
                                            any(byte[].class),
                                            eq(request),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(htmlContent);

            wrMock.when(
                            () ->
                                    WebResponseUtils.bytesToWebResponse(
                                            htmlContent.getBytes(StandardCharsets.UTF_8),
                                            "test.eml.html",
                                            MediaType.TEXT_HTML))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void convertEmlToPdf_htmlConversionFailureReturnsError() throws Exception {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.eml", "message/rfc822", "email content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);
        request.setDownloadHtml(true);

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToHtml(
                                            any(byte[].class),
                                            eq(request),
                                            eq(customHtmlSanitizer)))
                    .thenThrow(new IOException("Parse error"));

            ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertTrue(
                    new String(response.getBody(), StandardCharsets.UTF_8)
                            .contains("HTML conversion failed"));
        }
    }

    @Test
    void convertEmlToPdf_nullPdfOutputReturnsError() throws Exception {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.eml", "message/rfc822", "email content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToPdf(
                                            any(), any(), any(), any(), any(), any(), any()))
                    .thenReturn(null);

            ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertTrue(
                    new String(response.getBody(), StandardCharsets.UTF_8)
                            .contains("empty output"));
        }
    }

    @Test
    void convertEmlToPdf_msgFileAccepted() throws Exception {
        byte[] pdfBytes = "fake-pdf".getBytes();
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "outlook.msg",
                        "application/vnd.ms-outlook",
                        "msg content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(pdfBytes);

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToPdf(
                                            any(), any(), any(), any(), any(), any(), any()))
                    .thenReturn(pdfBytes);

            wrMock.when(
                            () ->
                                    WebResponseUtils.bytesToWebResponse(
                                            any(byte[].class),
                                            any(String.class),
                                            any(MediaType.class)))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void convertEmlToPdf_interruptedExceptionReturnsError() throws Exception {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.eml", "message/rfc822", "email content".getBytes());

        EmlToPdfRequest request = new EmlToPdfRequest();
        request.setFileInput(file);

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToPdf(
                                            any(), any(), any(), any(), any(), any(), any()))
                    .thenThrow(new InterruptedException("interrupted"));

            ResponseEntity<byte[]> response = controller.convertEmlToPdf(request);

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertTrue(
                    new String(response.getBody(), StandardCharsets.UTF_8).contains("interrupted"));
        }
    }
}
