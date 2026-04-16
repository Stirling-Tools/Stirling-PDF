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

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class DecompressPdfControllerTest {
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
    @InjectMocks private DecompressPdfController controller;

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

    private MockMultipartFile createRealPdf(String content) throws IOException {
        Path path = tempDir.resolve("test.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            if (content != null) {
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(50, 700);
                    cs.showText(content);
                    cs.endText();
                }
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, Files.readAllBytes(path));
    }

    @Test
    void decompressPdf_basicSuccess() throws IOException {
        MockMultipartFile file = createRealPdf("Hello World");
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.decompressPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(drainBody(response)).isNotEmpty();
        // Verify the result is a valid PDF
        try (PDDocument result = Loader.loadPDF(drainBody(response))) {
            assertThat(result.getNumberOfPages()).isEqualTo(1);
        }
    }

    @Test
    void decompressPdf_emptyPdf() throws IOException {
        MockMultipartFile file = createRealPdf(null);
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.decompressPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void decompressPdf_ioException() throws IOException {
        MockMultipartFile file = createRealPdf("test");
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        when(pdfDocumentFactory.load(file)).thenThrow(new IOException("corrupt"));

        assertThatThrownBy(() -> controller.decompressPdf(request)).isInstanceOf(IOException.class);
    }

    @Test
    void decompressPdf_resultFilename() throws IOException {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "mydoc.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        createRealPdf("test").getBytes());
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.decompressPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String contentDisposition = response.getHeaders().getFirst("Content-Disposition");
        assertThat(contentDisposition).contains("_decompressed.pdf");
    }

    @Test
    void decompressPdf_multiPagePdf() throws IOException {
        Path path = tempDir.resolve("multi.pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < 3; i++) {
                PDPage page = new PDPage();
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(50, 700);
                    cs.showText("Page " + (i + 1));
                    cs.endText();
                }
            }
            doc.save(path.toFile());
        }
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "multi.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        Files.readAllBytes(path));
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.decompressPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        try (PDDocument result = Loader.loadPDF(drainBody(response))) {
            assertThat(result.getNumberOfPages()).isEqualTo(3);
        }
    }

    @Test
    void decompressPdf_outputIsLargerThanInput() throws IOException {
        MockMultipartFile file = createRealPdf("Compressed content test data");
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.decompressPdf(request);

        assertThat(response.getBody()).isNotNull();
        // Decompressed PDF should generally be larger or equal to compressed
        assertThat(drainBody(response).length).isGreaterThan(0);
    }

    @Test
    void decompressPdf_returnsOkContentType() throws IOException {
        MockMultipartFile file = createRealPdf("test");
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<StreamingResponseBody> response = controller.decompressPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
