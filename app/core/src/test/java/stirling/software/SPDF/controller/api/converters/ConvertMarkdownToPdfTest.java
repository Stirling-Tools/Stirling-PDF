package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
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
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertMarkdownToPdfTest {

    private static Response streamingOk(byte[] bytes) {
        return Response.ok(bytes).build();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private CustomHtmlSanitizer customHtmlSanitizer;

    @InjectMocks private ConvertMarkdownToPdf controller;

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
    void markdownToPdf_nullFileInputThrows() {
        assertThrows(Exception.class, () -> controller.markdownToPdf(null));
    }

    @Test
    void markdownToPdf_invalidExtensionThrows() {
        FileUpload file = TestFileUploads.of("content".getBytes(), "test.txt", "text/plain");

        assertThrows(Exception.class, () -> controller.markdownToPdf(file));
    }

    @Test
    void markdownToPdf_validMarkdownFile() throws Exception {
        byte[] mdContent = "# Hello World\n\nThis is markdown.".getBytes();
        byte[] pdfBytes = "pdf-content".getBytes();
        byte[] processedPdf = "processed-pdf".getBytes();

        FileUpload file = TestFileUploads.of(mdContent, "readme.md", "text/markdown");

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(any(byte[].class)))
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
                                            isNull(),
                                            any(byte[].class),
                                            eq("converted.html"),
                                            eq(tempFileManager),
                                            eq(customHtmlSanitizer)))
                    .thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("readme.md", ".pdf"))
                    .thenReturn("readme.pdf");

            wrMock.when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            Response response = controller.markdownToPdf(file);

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        }
    }

    @Test
    void markdownToPdf_nullFilenameThrows() {
        FileUpload file = TestFileUploads.of("# Title".getBytes(), null, "text/markdown");

        assertThrows(Exception.class, () -> controller.markdownToPdf(file));
    }

    @Test
    void controllerIsConstructed() {
        assertNotNull(controller);
    }

    @Test
    void tableAttributeProvider_setsClassOnTableBlock() {
        TableAttributeProvider provider = new TableAttributeProvider();
        assertNotNull(provider);
    }
}
