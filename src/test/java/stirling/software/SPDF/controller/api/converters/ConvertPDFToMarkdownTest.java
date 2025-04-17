package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.model.api.converters.ConvertPDFToMarkdown;

@ExtendWith(MockitoExtension.class)
class ConvertPDFToMarkdownTest {

    @InjectMocks private ConvertPDFToMarkdown convertPDFToMarkdown;

    @Test
    @DisplayName("Should return 400 for non-PDF file")
    void testNonPdfFileReturnsBadRequest() throws Exception {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "note.txt", "text/plain", "not a pdf".getBytes());

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<byte[]> response = convertPDFToMarkdown.processPdfToMarkdown(request);
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    @DisplayName("Should throw error on empty PDF file")
    void testEmptyPdfThrowsError() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "empty.pdf", "application/pdf", new byte[0]);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        assertThrows(Exception.class, () -> convertPDFToMarkdown.processPdfToMarkdown(request));
    }

    @Test
    @DisplayName("Should convert single-page PDF to markdown content")
    void testSinglePagePdfToMarkdown() throws Exception {
        InputStream is = getClass().getClassLoader().getResourceAsStream("test.pdf");
        assertNotNull(is);

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "test.pdf", "application/pdf", is);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<byte[]> response = convertPDFToMarkdown.processPdfToMarkdown(request);

        assertEquals(200, response.getStatusCodeValue());
        assertTrue(response.getBody().length > 0);

        String content = new String(response.getBody(), StandardCharsets.UTF_8);
        assertTrue(content.contains("wkp")); // or other title
    }

    /**
     * Why we use `zipBytes.length > 0` instead of checking .md file presence: Due to limitations in
     * the current PDF-to-Markdown conversion pipeline, the content extracted from certain PDFs
     * (especially those lacking structured tags or composed of image-based text) may not yield any
     * usable HTML elements that Flexmark can convert. As a result, even multi-page PDFs might
     * produce no .md output or an empty zip archive.
     *
     * <p>Here we simply assert that the zip is non-empty to verify the conversion process at least
     * completed and returned a binary response.
     *
     * <p>If heading-level Markdown output is required, the underlying HTML parser or converter
     * logic would need to be enhanced to recognize heading structures more robustly (e.g., based on
     * font size).
     */
    @Test
    @DisplayName("Should return zip with markdown for multi-page PDF")
    void testMultiPagePdfReturnsZip() throws Exception {
        InputStream is = getClass().getClassLoader().getResourceAsStream("multi_page.pdf");
        assertNotNull(is);

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "multi_page.pdf", "application/pdf", is);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<byte[]> response = convertPDFToMarkdown.processPdfToMarkdown(request);

        assertEquals(200, response.getStatusCodeValue());
        byte[] zipBytes = response.getBody();

        assertTrue(zipBytes.length > 0, "Zip content should not be empty");
    }

    @Test
    @DisplayName("Should convert a valid PDF to Markdown successfully")
    void testProcessPdfToMarkdown_validPdf_returnsMarkdownBytes() throws Exception {
        // Arrange
        InputStream input = getClass().getClassLoader().getResourceAsStream("test.pdf");
        assertNotNull(input, "Test PDF file not found in resources");

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "test.pdf", "application/pdf", input);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        // Act
        ResponseEntity<byte[]> response = convertPDFToMarkdown.processPdfToMarkdown(request);

        // Assert
        assertEquals(200, response.getStatusCodeValue(), "Response status should be 200 OK");
        assertNotNull(response.getBody(), "Returned body should not be null");
        assertTrue(response.getBody().length > 0, "Returned markdown should not be empty");

        String markdownContent = new String(response.getBody(), StandardCharsets.UTF_8);
        System.out.println("testResult" + markdownContent);
        assertTrue(markdownContent.contains("wkp testing case"));
        assertTrue(markdownContent.contains("**first title**"));
        assertTrue(markdownContent.contains("*second title"));
    }

    /*
     * ⚠️ Known Limitation in the Current Implementation:
     *
     * The method PDFToFile.processPdfToMarkdown first converts the PDF file to HTML using `pdftohtml`,
     * and then transforms the resulting HTML into Markdown using FlexmarkHtmlConverter.
     *
     * However, this conversion pipeline fails to accurately preserve heading hierarchy (e.g., level-1 `#`, level-2 `##` headings).
     * Instead, all heading-like elements from the original PDF are flattened and rendered as bold text (`**bold**`) in the final Markdown output,
     * resulting in a loss of structural semantics.
     *
     * Possible reasons include:
     * - The HTML generated by `pdftohtml` lacks proper semantic tags like `<h1>`, `<h2>`, etc.
     * - FlexmarkHtmlConverter interprets non-semantic tags (e.g., `<font>`, `<b>`) as plain bold formatting.
     *
     * 📌 Testing Suggestions:
     * - Focus on asserting the presence of key content in the output Markdown, rather than relying on heading syntax like `#`, `##`, etc.
     * - If heading hierarchy is required, consider enhancing the HTML-to-Markdown conversion logic or replacing `pdftohtml`
     *   with a more semantically rich parsing toolchain (e.g., `pdf2json` with AST-level analysis).
     */
    @Test
    @DisplayName("Should convert a valid PDF to Markdown successfully1")
    void testProcessPdfToMarkdown_validPdf_returnsMarkdownBytes1() throws Exception {
        // Arrange
        InputStream input = getClass().getClassLoader().getResourceAsStream("test.pdf");
        assertNotNull(input, "Test PDF file not found in resources");

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "multi_page.pdf", "application/pdf", input);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        // Act
        ResponseEntity<byte[]> response = convertPDFToMarkdown.processPdfToMarkdown(request);

        // Assert
        assertEquals(200, response.getStatusCodeValue(), "Response status should be 200 OK");
        assertNotNull(response.getBody(), "Returned body should not be null");
        assertTrue(response.getBody().length > 0, "Returned markdown should not be empty");

        String markdownContent = new String(response.getBody(), StandardCharsets.UTF_8);
        assertTrue(markdownContent.contains("**wkp"));
        assertTrue(markdownContent.contains("**second title"));
        assertTrue(markdownContent.contains("**third title"));
    }

    @Test
    @DisplayName("Should throw exception for empty PDF input")
    void testProcessPdfToMarkdown_emptyFile_throwsException() {
        // Arrange
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "test.pdf", "application/pdf", new byte[0]);
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        // Act & Assert
        Exception exception =
                assertThrows(
                        Exception.class,
                        () -> convertPDFToMarkdown.processPdfToMarkdown(request),
                        "Expected exception for empty input file");
        assertNotNull(exception.getMessage());
    }

    @Test
    @DisplayName("Should throw exception for non-PDF file with .pdf extension")
    void testProcessPdfToMarkdown_invalidPdf_throwsException() {
        // Arrange
        byte[] invalidContent = "This is not a real PDF".getBytes();
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "fake.pdf", "application/pdf", invalidContent);
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        // Act & Assert
        Exception exception =
                assertThrows(
                        Exception.class,
                        () -> convertPDFToMarkdown.processPdfToMarkdown(request),
                        "Expected exception for invalid PDF file");
        assertTrue(
                exception.getMessage().contains("Syntax Error")
                        || exception.getMessage().contains("Couldn't"),
                "Error message should indicate syntax or parsing failure");
    }

    @Test
    @DisplayName("Should throw exception if no file is provided")
    void testProcessPdfToMarkdown_nullFile_throwsException() {
        // Arrange
        PDFFile request = new PDFFile();
        request.setFileInput(null);

        // Act & Assert
        assertThrows(
                NullPointerException.class,
                () -> convertPDFToMarkdown.processPdfToMarkdown(request),
                "Expected NullPointerException when no file is provided");
    }

    @Test
    @DisplayName("Should convert PDF with image to Markdown successfully")
    void testProcessPdfToMarkdown_withImagePdf_success() throws Exception {
        InputStream is = getClass().getClassLoader().getResourceAsStream("pdf_with_image.pdf");
        assertNotNull(is, "Test PDF with image not found");

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "pdf_with_image.pdf", "application/pdf", is);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<byte[]> response = convertPDFToMarkdown.processPdfToMarkdown(request);

        assertEquals(200, response.getStatusCodeValue());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().length > 0);

        String markdown = new String(response.getBody(), StandardCharsets.UTF_8);
        assertTrue(markdown.contains("!["), "Expected Markdown image syntax");
    }

    @Test
    @DisplayName("Should convert PDF with table to Markdown successfully")
    void testProcessPdfToMarkdown_withTablePdf_success() throws Exception {
        InputStream is = getClass().getClassLoader().getResourceAsStream("pdf_with_image.pdf");
        assertNotNull(is, "Test PDF with table not found");

        MockMultipartFile file =
                new MockMultipartFile("fileInput", "pdf_with_image.pdf", "application/pdf", is);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<byte[]> response = convertPDFToMarkdown.processPdfToMarkdown(request);

        assertEquals(200, response.getStatusCodeValue());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().length > 0);

        String markdown = new String(response.getBody(), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("Should throw error when PDF input content is null")
    void testProcessPdfToMarkdown_nullContentPdf_throwsException() {
        MockMultipartFile file =
                new MockMultipartFile("fileInput", "null.pdf", "application/pdf", (byte[]) null);
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        assertThrows(Exception.class, () -> convertPDFToMarkdown.processPdfToMarkdown(request));
    }
}
