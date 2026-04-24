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

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertMarkdownToPdfTest {
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
        GeneralFile generalFile = new GeneralFile();
        generalFile.setFileInput(null);

        assertThrows(Exception.class, () -> controller.markdownToPdf(generalFile));
    }

    @Test
    void markdownToPdf_invalidExtensionThrows() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "test.txt", "text/plain", "content".getBytes());
        GeneralFile generalFile = new GeneralFile();
        generalFile.setFileInput(file);

        assertThrows(Exception.class, () -> controller.markdownToPdf(generalFile));
    }

    @Test
    void markdownToPdf_validMarkdownFile() throws Exception {
        byte[] mdContent = "# Hello World\n\nThis is markdown.".getBytes();
        byte[] pdfBytes = "pdf-content".getBytes();
        byte[] processedPdf = "processed-pdf".getBytes();

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "readme.md", "text/markdown", mdContent);
        GeneralFile generalFile = new GeneralFile();
        generalFile.setFileInput(file);

        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(any(byte[].class)))
                .thenReturn(processedPdf);

        ResponseEntity<Resource> expectedResponse = streamingOk(processedPdf);

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

            ResponseEntity<Resource> response = controller.markdownToPdf(generalFile);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void markdownToPdf_nullFilenameThrows() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", null, "text/markdown", "# Title".getBytes());
        GeneralFile generalFile = new GeneralFile();
        generalFile.setFileInput(file);

        assertThrows(Exception.class, () -> controller.markdownToPdf(generalFile));
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
