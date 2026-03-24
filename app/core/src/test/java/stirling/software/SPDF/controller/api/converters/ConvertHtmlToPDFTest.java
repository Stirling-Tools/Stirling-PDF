package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertHtmlToPDFTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private CustomHtmlSanitizer customHtmlSanitizer;

    @InjectMocks private ConvertHtmlToPDF controller;

    @Test
    void htmlToPdf_nullFileInputThrows() {
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        request.setFileInput(null);

        assertThrows(Exception.class, () -> controller.HtmlToPdf(request));
    }

    @Test
    void htmlToPdf_invalidExtensionThrows() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "test.txt", "text/plain", "content".getBytes());
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        request.setFileInput(file);

        assertThrows(Exception.class, () -> controller.HtmlToPdf(request));
    }

    @Test
    void htmlToPdf_validHtmlFile() throws Exception {
        byte[] htmlContent = "<html><body>Hello</body></html>".getBytes();
        byte[] pdfBytes = "pdf-content".getBytes();
        byte[] processedPdf = "processed-pdf".getBytes();

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "test.html", "text/html", htmlContent);
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        request.setFileInput(file);

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes))
                .thenReturn(processedPdf);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(processedPdf);

        try (MockedStatic<FileToPdf> ftpMock = Mockito.mockStatic(FileToPdf.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            ftpMock.when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            eq("/usr/bin/weasyprint"),
                                            eq(request),
                                            any(byte[].class),
                                            eq("test.html"),
                                            eq(tempFileManager),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("test.html", ".pdf"))
                    .thenReturn("test.pdf");

            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(processedPdf, "test.pdf"))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = controller.HtmlToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void htmlToPdf_validZipFile() throws Exception {
        byte[] zipContent = "zip-content".getBytes();
        byte[] pdfBytes = "pdf-content".getBytes();
        byte[] processedPdf = "processed-pdf".getBytes();

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "archive.zip", "application/zip", zipContent);
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        request.setFileInput(file);

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes))
                .thenReturn(processedPdf);

        ResponseEntity<byte[]> expectedResponse = ResponseEntity.ok(processedPdf);

        try (MockedStatic<FileToPdf> ftpMock = Mockito.mockStatic(FileToPdf.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            ftpMock.when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            eq("/usr/bin/weasyprint"),
                                            eq(request),
                                            any(byte[].class),
                                            eq("archive.zip"),
                                            eq(tempFileManager),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("archive.zip", ".pdf"))
                    .thenReturn("archive.pdf");

            wrMock.when(() -> WebResponseUtils.bytesToWebResponse(processedPdf, "archive.pdf"))
                    .thenReturn(expectedResponse);

            ResponseEntity<byte[]> response = controller.HtmlToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void htmlToPdf_nullFilenameThrows() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", null, "text/html", "content".getBytes());
        HTMLToPdfRequest request = new HTMLToPdfRequest();
        request.setFileInput(file);

        assertThrows(Exception.class, () -> controller.HtmlToPdf(request));
    }
}
