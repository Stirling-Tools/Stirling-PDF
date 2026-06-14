package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.EmlToPdf;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertEmlToPDFTest {

    private static Response streamingOk(byte[] bytes) {
        return Response.ok(bytes).build();
    }

    private static byte[] bodyBytes(Response response) {
        Object entity = response.getEntity();
        return entity instanceof byte[] ? (byte[]) entity : new byte[0];
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private CustomHtmlSanitizer customHtmlSanitizer;

    @InjectMocks private ConvertEmlToPDF controller;

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
    }

    @Test
    void convertEmlToPdf_emptyFileReturnsBadRequest() {
        FileUpload emptyFile = TestFileUploads.of(new byte[0], "test.eml", "message/rfc822");

        Response response = controller.convertEmlToPdf(emptyFile, null, false, null, false, null);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertTrue(
                new String(bodyBytes(response), StandardCharsets.UTF_8)
                        .contains("No file provided"));
    }

    @Test
    void convertEmlToPdf_nullFilenameReturnsBadRequest() {
        FileUpload file = TestFileUploads.of("content".getBytes(), null, "message/rfc822");

        Response response = controller.convertEmlToPdf(file, null, false, null, false, null);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertTrue(
                new String(bodyBytes(response), StandardCharsets.UTF_8).contains("valid filename"));
    }

    @Test
    void convertEmlToPdf_emptyFilenameReturnsBadRequest() {
        FileUpload file = TestFileUploads.of("content".getBytes(), "   ", "message/rfc822");

        Response response = controller.convertEmlToPdf(file, null, false, null, false, null);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }

    @Test
    void convertEmlToPdf_invalidFileTypeReturnsBadRequest() {
        FileUpload file = TestFileUploads.of("content".getBytes(), "test.txt", "text/plain");

        Response response = controller.convertEmlToPdf(file, null, false, null, false, null);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertTrue(
                new String(bodyBytes(response), StandardCharsets.UTF_8)
                        .contains("valid EML or MSG"));
    }

    @Test
    void convertEmlToPdf_successfulPdfConversion() throws Exception {
        byte[] pdfBytes = "fake-pdf-content".getBytes();
        FileUpload file =
                TestFileUploads.of("email content".getBytes(), "test.eml", "message/rfc822");

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        Response expectedResponse = streamingOk(pdfBytes);

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToPdf(
                                            eq("/usr/bin/weasyprint"),
                                            any(EmlToPdfRequest.class),
                                            any(byte[].class),
                                            eq("test.eml"),
                                            eq(pdfDocumentFactory),
                                            eq(tempFileManager),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(pdfBytes);

            wrMock.when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response = controller.convertEmlToPdf(file, null, false, null, false, null);

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
            assertArrayEquals(pdfBytes, bodyBytes(response));
        }
    }

    @Test
    void convertEmlToPdf_downloadHtmlMode() throws Exception {
        String htmlContent = "<html><body>email</body></html>";
        FileUpload file =
                TestFileUploads.of("email content".getBytes(), "test.eml", "message/rfc822");

        Response expectedResponse = streamingOk(htmlContent.getBytes(StandardCharsets.UTF_8));

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToHtml(
                                            any(byte[].class),
                                            any(EmlToPdfRequest.class),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(htmlContent);

            wrMock.when(
                            () ->
                                    WebResponseUtils.fileToWebResponse(
                                            any(TempFile.class), anyString(), any(MediaType.class)))
                    .thenReturn(expectedResponse);

            Response response = controller.convertEmlToPdf(file, null, false, null, true, null);

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        }
    }

    @Test
    void convertEmlToPdf_htmlConversionFailureReturnsError() throws Exception {
        FileUpload file =
                TestFileUploads.of("email content".getBytes(), "test.eml", "message/rfc822");

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToHtml(
                                            any(byte[].class),
                                            any(EmlToPdfRequest.class),
                                            eq(customHtmlSanitizer)))
                    .thenThrow(new IOException("Parse error"));

            Response response = controller.convertEmlToPdf(file, null, false, null, true, null);

            assertEquals(
                    Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), response.getStatus());
            assertTrue(
                    new String(bodyBytes(response), StandardCharsets.UTF_8)
                            .contains("HTML conversion failed"));
        }
    }

    @Test
    void convertEmlToPdf_nullPdfOutputReturnsError() throws Exception {
        FileUpload file =
                TestFileUploads.of("email content".getBytes(), "test.eml", "message/rfc822");

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToPdf(
                                            any(), any(), any(), any(), any(), any(), any()))
                    .thenReturn(null);

            Response response = controller.convertEmlToPdf(file, null, false, null, false, null);

            assertEquals(
                    Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), response.getStatus());
            assertTrue(
                    new String(bodyBytes(response), StandardCharsets.UTF_8)
                            .contains("empty output"));
        }
    }

    @Test
    void convertEmlToPdf_msgFileAccepted() throws Exception {
        byte[] pdfBytes = "fake-pdf".getBytes();
        FileUpload file =
                TestFileUploads.of(
                        "msg content".getBytes(), "outlook.msg", "application/vnd.ms-outlook");

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        Response expectedResponse = streamingOk(pdfBytes);

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
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response = controller.convertEmlToPdf(file, null, false, null, false, null);

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        }
    }

    @Test
    void convertEmlToPdf_interruptedExceptionReturnsError() throws Exception {
        FileUpload file =
                TestFileUploads.of("email content".getBytes(), "test.eml", "message/rfc822");

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        try (MockedStatic<EmlToPdf> emlMock = Mockito.mockStatic(EmlToPdf.class)) {

            emlMock.when(
                            () ->
                                    EmlToPdf.convertEmlToPdf(
                                            any(), any(), any(), any(), any(), any(), any()))
                    .thenThrow(new InterruptedException("interrupted"));

            Response response = controller.convertEmlToPdf(file, null, false, null, false, null);

            assertEquals(
                    Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), response.getStatus());
            assertTrue(
                    new String(bodyBytes(response), StandardCharsets.UTF_8)
                            .contains("interrupted"));
        }
    }
}
