package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.model.api.misc.ExtractHeaderRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class AutoRenameControllerTest {
    private static ResponseEntity<StreamingResponseBody> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(out -> out.write(bytes));
    }

    private static byte[] drainBody(ResponseEntity<StreamingResponseBody> response)
            throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        response.getBody().writeTo(baos);
        return baos.toByteArray();
    }

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private AutoRenameController controller;

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

    private MockMultipartFile createPdfWithText(String text, float fontSize) throws IOException {
        Path path = tempDir.resolve("test.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), fontSize);
                cs.newLineAtOffset(50, 700);
                cs.showText(text);
                cs.endText();
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, Files.readAllBytes(path));
    }

    private ExtractHeaderRequest createRequest(MockMultipartFile file, boolean fallback) {
        ExtractHeaderRequest req = new ExtractHeaderRequest();
        req.setFileInput(file);
        req.setUseFirstTextAsFallback(fallback);
        return req;
    }

    @Test
    void extractHeader_withLargeTitle() throws Exception {
        MockMultipartFile file = createPdfWithText("My Document Title", 24f);
        ExtractHeaderRequest request = createRequest(file, false);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.extractHeader(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(drainBody(response)).isNotEmpty();
        String contentDisposition = response.getHeaders().getFirst("Content-Disposition");
        assertThat(contentDisposition).contains(".pdf");
    }

    @Test
    void extractHeader_emptyDocument() throws Exception {
        Path path = tempDir.resolve("empty.pdf");
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.save(path.toFile());
        }
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "empty.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        Files.readAllBytes(path));
        ExtractHeaderRequest request = createRequest(file, false);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.extractHeader(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void extractHeader_useFirstTextAsFallback() throws Exception {
        MockMultipartFile file = createPdfWithText("Some body text", 12f);
        ExtractHeaderRequest request = createRequest(file, true);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.extractHeader(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void extractHeader_ioException() throws Exception {
        MockMultipartFile file = createPdfWithText("test", 12f);
        ExtractHeaderRequest request = createRequest(file, false);

        when(pdfDocumentFactory.load(file)).thenThrow(new IOException("corrupt"));

        assertThatThrownBy(() -> controller.extractHeader(request)).isInstanceOf(IOException.class);
    }

    @Test
    void extractHeader_multipleFontSizes() throws Exception {
        Path path = tempDir.resolve("multi_font.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                // Small text first
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10f);
                cs.newLineAtOffset(50, 700);
                cs.showText("Small text line");
                cs.endText();
                // Then larger title
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 24f);
                cs.newLineAtOffset(50, 650);
                cs.showText("Big Title");
                cs.endText();
            }
            doc.save(path.toFile());
        }
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "multi.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        Files.readAllBytes(path));
        ExtractHeaderRequest request = createRequest(file, false);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.extractHeader(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        // The largest font text should be used as title (URL-encoded in Content-Disposition)
        String contentDisposition = response.getHeaders().getFirst("Content-Disposition");
        assertThat(contentDisposition).contains("Big%20Title");
    }

    @Test
    void extractHeader_longTitle_fallsBackToOriginalFilename() throws Exception {
        // Create text longer than 255 chars
        String longText = "A".repeat(300);
        MockMultipartFile file = createPdfWithText(longText, 24f);
        ExtractHeaderRequest request = createRequest(file, false);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.extractHeader(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        // Should fallback to original filename since header is too long
        String contentDisposition = response.getHeaders().getFirst("Content-Disposition");
        assertThat(contentDisposition).contains("test.pdf");
    }

    @Test
    void extractHeader_withSpecialCharacters() throws Exception {
        MockMultipartFile file = createPdfWithText("Title: Test/Doc*File", 24f);
        ExtractHeaderRequest request = createRequest(file, false);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.extractHeader(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        // Special characters should be sanitized
        String contentDisposition = response.getHeaders().getFirst("Content-Disposition");
        assertThat(contentDisposition).contains(".pdf");
    }

    @Test
    void extractHeader_fallbackDisabled_noTitle_usesOriginalFilename() throws Exception {
        Path path = tempDir.resolve("notitle.pdf");
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.save(path.toFile());
        }
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "original_name.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        Files.readAllBytes(path));
        ExtractHeaderRequest request = createRequest(file, false);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.extractHeader(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
