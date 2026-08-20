package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
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

import jakarta.ws.rs.core.Response;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertHtmlToPDFTest {

    private static Response streamingOk(byte[] bytes) {
        return Response.ok(bytes).build();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private CustomHtmlSanitizer customHtmlSanitizer;

    @InjectMocks private ConvertHtmlToPDF controller;

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
    void htmlToPdf_nullFileInputThrows() {
        assertThrows(Exception.class, () -> controller.HtmlToPdf(null, null, 1f));
    }

    @Test
    void htmlToPdf_invalidExtensionThrows() {
        FileUpload file = TestFileUploads.of("content".getBytes(), "test.txt", "text/plain");

        assertThrows(Exception.class, () -> controller.HtmlToPdf(file, null, 1f));
    }

    @Test
    void htmlToPdf_validHtmlFile() throws Exception {
        byte[] htmlContent = "<html><body>Hello</body></html>".getBytes();
        byte[] pdfBytes = "pdf-content".getBytes();
        byte[] processedPdf = "processed-pdf".getBytes();

        FileUpload file = TestFileUploads.of(htmlContent, "test.html", "text/html");

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes))
                .thenReturn(processedPdf);

        Response expectedResponse = streamingOk(processedPdf);

        try (MockedStatic<FileToPdf> ftpMock = Mockito.mockStatic(FileToPdf.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            ftpMock.when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            eq("/usr/bin/weasyprint"),
                                            any(HTMLToPdfRequest.class),
                                            any(byte[].class),
                                            eq("test.html"),
                                            eq(tempFileManager),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("test.html", ".pdf"))
                    .thenReturn("test.pdf");

            wrMock.when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response = controller.HtmlToPdf(file, null, 1f);

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        }
    }

    @Test
    void htmlToPdf_validZipFile() throws Exception {
        byte[] zipContent = "zip-content".getBytes();
        byte[] pdfBytes = "pdf-content".getBytes();
        byte[] processedPdf = "processed-pdf".getBytes();

        FileUpload file = TestFileUploads.of(zipContent, "archive.zip", "application/zip");

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes))
                .thenReturn(processedPdf);

        Response expectedResponse = streamingOk(processedPdf);

        try (MockedStatic<FileToPdf> ftpMock = Mockito.mockStatic(FileToPdf.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            ftpMock.when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            eq("/usr/bin/weasyprint"),
                                            any(HTMLToPdfRequest.class),
                                            any(byte[].class),
                                            eq("archive.zip"),
                                            eq(tempFileManager),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("archive.zip", ".pdf"))
                    .thenReturn("archive.pdf");

            wrMock.when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response = controller.HtmlToPdf(file, null, 1f);

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        }
    }

    @Test
    void htmlToPdf_nullFilenameThrows() {
        FileUpload file = TestFileUploads.of("content".getBytes(), null, "text/html");

        assertThrows(Exception.class, () -> controller.HtmlToPdf(file, null, 1f));
    }
}
