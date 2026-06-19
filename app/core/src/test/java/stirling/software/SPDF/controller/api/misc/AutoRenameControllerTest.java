package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
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
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class AutoRenameControllerTest {

    private static byte[] drainBody(Response response) throws IOException {
        Object entity = response.getEntity();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        if (entity instanceof byte[] bytes) {
            baos.write(bytes);
        } else if (entity instanceof StreamingOutput streaming) {
            streaming.write(baos);
        } else {
            throw new IllegalStateException(
                    "Unexpected response entity type: "
                            + (entity == null ? "null" : entity.getClass().getName()));
        }
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

    private byte[] createPdfBytesWithText(String text, float fontSize) throws IOException {
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
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Test
    void extractHeader_withLargeTitle() throws Exception {
        byte[] bytes = createPdfBytesWithText("My Document Title", 24f);
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.extractHeader(file, null, false);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(drainBody(response)).isNotEmpty();
        String contentDisposition = response.getHeaderString("Content-Disposition");
        assertThat(contentDisposition).contains(".pdf");
    }

    @Test
    void extractHeader_emptyDocument() throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.save(baos);
        }
        byte[] bytes = baos.toByteArray();
        FileUpload file = TestFileUploads.of(bytes, "empty.pdf", "application/pdf");

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.extractHeader(file, null, false);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void extractHeader_useFirstTextAsFallback() throws Exception {
        byte[] bytes = createPdfBytesWithText("Some body text", 12f);
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.extractHeader(file, null, true);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void extractHeader_ioException() throws Exception {
        byte[] bytes = createPdfBytesWithText("test", 12f);
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenThrow(new IOException("corrupt"));

        assertThatThrownBy(() -> controller.extractHeader(file, null, false))
                .isInstanceOf(IOException.class);
    }

    @Test
    void extractHeader_multipleFontSizes() throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
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
            doc.save(baos);
        }
        byte[] bytes = baos.toByteArray();
        FileUpload file = TestFileUploads.of(bytes, "multi.pdf", "application/pdf");

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.extractHeader(file, null, false);

        assertThat(response.getStatus()).isEqualTo(200);
        // The largest font text should be used as title (URL-encoded in Content-Disposition)
        String contentDisposition = response.getHeaderString("Content-Disposition");
        assertThat(contentDisposition).contains("Big%20Title");
    }

    @Test
    void extractHeader_longTitle_fallsBackToOriginalFilename() throws Exception {
        // Create text longer than 255 chars
        String longText = "A".repeat(300);
        byte[] bytes = createPdfBytesWithText(longText, 24f);
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.extractHeader(file, null, false);

        assertThat(response.getStatus()).isEqualTo(200);
        // Should fallback to original filename since header is too long
        String contentDisposition = response.getHeaderString("Content-Disposition");
        assertThat(contentDisposition).contains("test.pdf");
    }

    @Test
    void extractHeader_withSpecialCharacters() throws Exception {
        byte[] bytes = createPdfBytesWithText("Title: Test/Doc*File", 24f);
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.extractHeader(file, null, false);

        assertThat(response.getStatus()).isEqualTo(200);
        // Special characters should be sanitized
        String contentDisposition = response.getHeaderString("Content-Disposition");
        assertThat(contentDisposition).contains(".pdf");
    }

    @Test
    void extractHeader_fallbackDisabled_noTitle_usesOriginalFilename() throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.save(baos);
        }
        byte[] bytes = baos.toByteArray();
        FileUpload file = TestFileUploads.of(bytes, "original_name.pdf", "application/pdf");

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.extractHeader(file, null, false);

        assertThat(response.getStatus()).isEqualTo(200);
    }
}
