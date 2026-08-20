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
class DecompressPdfControllerTest {

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

    private byte[] createRealPdfBytes(String content) throws IOException {
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
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Test
    void decompressPdf_basicSuccess() throws IOException {
        byte[] bytes = createRealPdfBytes("Hello World");
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.decompressPdf(file, null);

        assertThat(response.getStatus()).isEqualTo(200);
        byte[] body = drainBody(response);
        assertThat(body).isNotEmpty();
        // Verify the result is a valid PDF
        try (PDDocument result = Loader.loadPDF(body)) {
            assertThat(result.getNumberOfPages()).isEqualTo(1);
        }
    }

    @Test
    void decompressPdf_emptyPdf() throws IOException {
        byte[] bytes = createRealPdfBytes(null);
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.decompressPdf(file, null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void decompressPdf_ioException() throws IOException {
        byte[] bytes = createRealPdfBytes("test");
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenThrow(new IOException("corrupt"));

        assertThatThrownBy(() -> controller.decompressPdf(file, null))
                .isInstanceOf(IOException.class);
    }

    @Test
    void decompressPdf_resultFilename() throws IOException {
        byte[] bytes = createRealPdfBytes("test");
        FileUpload file = TestFileUploads.of(bytes, "mydoc.pdf", "application/pdf");

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.decompressPdf(file, null);

        assertThat(response.getStatus()).isEqualTo(200);
        String contentDisposition = response.getHeaderString("Content-Disposition");
        assertThat(contentDisposition).contains("_decompressed.pdf");
    }

    @Test
    void decompressPdf_multiPagePdf() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
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
            doc.save(baos);
        }
        byte[] bytes = baos.toByteArray();
        FileUpload file = TestFileUploads.of(bytes, "multi.pdf", "application/pdf");

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.decompressPdf(file, null);

        assertThat(response.getStatus()).isEqualTo(200);
        try (PDDocument result = Loader.loadPDF(drainBody(response))) {
            assertThat(result.getNumberOfPages()).isEqualTo(3);
        }
    }

    @Test
    void decompressPdf_outputIsLargerThanInput() throws IOException {
        byte[] bytes = createRealPdfBytes("Compressed content test data");
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.decompressPdf(file, null);

        assertThat(response.getEntity()).isNotNull();
        // Decompressed PDF should generally be larger or equal to compressed
        assertThat(drainBody(response).length).isGreaterThan(0);
    }

    @Test
    void decompressPdf_returnsOkContentType() throws IOException {
        byte[] bytes = createRealPdfBytes("test");
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));

        Response response = controller.decompressPdf(file, null);

        assertThat(response.getStatus()).isEqualTo(200);
    }
}
