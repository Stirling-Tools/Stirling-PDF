package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.RuntimePathConfig;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.api.GeneralFile;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.FileToPdf;

@ExtendWith(MockitoExtension.class)
class ConvertMarkdownToPdfTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock private ApplicationProperties applicationProperties;

    @Mock private RuntimePathConfig runtimePathConfig;

    @InjectMocks private ConvertMarkdownToPdf convertMarkdownToPdf;

    @Test
    @DisplayName("Should convert valid markdown file to PDF")
    void testMarkdownToPdf_validMarkdown_success() throws Exception {
        String mdContent =
                "# Hello\n\nThis is a **test** of markdown to PDF.\n\n- Item 1\n- Item 2";
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.md", "text/markdown", mdContent.getBytes());

        GeneralFile request = new GeneralFile();
        request.setFileInput(file);

        byte[] fakePdf = "%PDF-Mock".getBytes(StandardCharsets.UTF_8);

        ApplicationProperties.System systemMock = mock(ApplicationProperties.System.class);
        when(systemMock.getDisableSanitize()).thenReturn(false);
        when(applicationProperties.getSystem()).thenReturn(systemMock);
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        try (MockedStatic<FileToPdf> mockedStatic = mockStatic(FileToPdf.class)) {
            mockedStatic
                    .when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            any(), any(), any(), any(), anyBoolean()))
                    .thenReturn(fakePdf);

            when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(fakePdf)).thenReturn(fakePdf);

            ResponseEntity<byte[]> response = convertMarkdownToPdf.markdownToPdf(request);

            assertEquals(200, response.getStatusCodeValue());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);
        }
    }

    @Test
    @DisplayName("Should throw error when uploading .txt instead of .md")
    void testMarkdownToPdf_invalidExtension_throwsException() {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.txt", "text/plain", "invalid content".getBytes());
        GeneralFile request = new GeneralFile();
        request.setFileInput(file);

        assertThrows(
                IllegalArgumentException.class, () -> convertMarkdownToPdf.markdownToPdf(request));
    }

    @Test
    @DisplayName("Should throw error when uploading empty markdown")
    void testMarkdownToPdf_emptyMarkdown_throwsException() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "test.md", "text/markdown", new byte[0]);
        GeneralFile request = new GeneralFile();
        request.setFileInput(file);

        assertThrows(Exception.class, () -> convertMarkdownToPdf.markdownToPdf(request));
    }

    @Test
    @DisplayName("Should throw error when no file is provided")
    void testMarkdownToPdf_nullFile_throwsException() {
        GeneralFile request = new GeneralFile();
        request.setFileInput(null);

        assertThrows(
                IllegalArgumentException.class, () -> convertMarkdownToPdf.markdownToPdf(request));
    }

    @Test
    @DisplayName("Should convert real Markdown file (from resources) to PDF")
    void testMarkdownToPdf_fromFile_success() throws Exception {
        InputStream input = getClass().getClassLoader().getResourceAsStream("Markdown.md");
        assertNotNull(input, "Markdown.md file not found in test resources");

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "Markdown.md", "text/markdown", input);
        GeneralFile request = new GeneralFile();
        request.setFileInput(file);

        byte[] fakePdf = "%PDF-Mock".getBytes(StandardCharsets.UTF_8);

        ApplicationProperties.System systemMock = mock(ApplicationProperties.System.class);
        when(systemMock.getDisableSanitize()).thenReturn(false);
        when(applicationProperties.getSystem()).thenReturn(systemMock);
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        try (MockedStatic<FileToPdf> mockedStatic = mockStatic(FileToPdf.class)) {
            mockedStatic
                    .when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            any(), any(), any(), any(), anyBoolean()))
                    .thenReturn(fakePdf);

            when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(fakePdf)).thenReturn(fakePdf);

            ResponseEntity<byte[]> response = convertMarkdownToPdf.markdownToPdf(request);

            assertEquals(200, response.getStatusCodeValue());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);
        }
    }

    @Test
    @DisplayName("Should convert markdown with table to PDF successfully")
    void testMarkdownToPdf_withTable_success() throws Exception {
        String tableMd =
                "| Name  | Score |\n"
                        + "|-------|-------|\n"
                        + "| Alice |  95   |\n"
                        + "| Bob   |  88   |";

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "table.md", "text/markdown", tableMd.getBytes());
        GeneralFile request = new GeneralFile();
        request.setFileInput(file);

        byte[] fakePdf = "%PDF-Mock-TABLE".getBytes(StandardCharsets.UTF_8);

        ApplicationProperties.System systemMock = mock(ApplicationProperties.System.class);
        when(systemMock.getDisableSanitize()).thenReturn(false);
        when(applicationProperties.getSystem()).thenReturn(systemMock);
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        try (MockedStatic<FileToPdf> mockedStatic = mockStatic(FileToPdf.class)) {
            mockedStatic
                    .when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            any(), any(), any(), any(), anyBoolean()))
                    .thenReturn(fakePdf);

            when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(fakePdf)).thenReturn(fakePdf);

            ResponseEntity<byte[]> response = convertMarkdownToPdf.markdownToPdf(request);

            assertEquals(200, response.getStatusCodeValue());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);
        }
    }

    @Test
    @DisplayName("Should convert markdown with image to PDF successfully")
    void testMarkdownToPdf_withImage_success() throws Exception {
        String mdWithImage =
                "# Image Test\n\n![Cat](https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg)\n";
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "image.md", "text/markdown", mdWithImage.getBytes());
        GeneralFile request = new GeneralFile();
        request.setFileInput(file);

        byte[] fakePdf = "%PDF-Mock-IMAGE".getBytes(StandardCharsets.UTF_8);

        ApplicationProperties.System systemMock = mock(ApplicationProperties.System.class);
        when(systemMock.getDisableSanitize()).thenReturn(false);
        when(applicationProperties.getSystem()).thenReturn(systemMock);
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");

        try (MockedStatic<FileToPdf> mockedStatic = mockStatic(FileToPdf.class)) {
            mockedStatic
                    .when(
                            () ->
                                    FileToPdf.convertHtmlToPdf(
                                            any(), any(), any(), any(), anyBoolean()))
                    .thenReturn(fakePdf);
            when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(fakePdf)).thenReturn(fakePdf);

            ResponseEntity<byte[]> response = convertMarkdownToPdf.markdownToPdf(request);
            assertEquals(200, response.getStatusCodeValue());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().length > 0);
        }
    }

    @Test
    @DisplayName("Should throw error when markdown content is null")
    void testMarkdownToPdf_nullContent_throwsException() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "null.md", "text/markdown", (byte[]) null);
        GeneralFile request = new GeneralFile();
        request.setFileInput(file);

        assertThrows(Exception.class, () -> convertMarkdownToPdf.markdownToPdf(request));
    }
}
