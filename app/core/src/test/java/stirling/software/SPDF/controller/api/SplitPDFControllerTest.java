package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.SplitPagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class SplitPDFControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private SplitPDFController controller;

    @BeforeEach
    void setUp() throws IOException {
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            String suffix = invocation.getArgument(0);
                            return Files.createTempFile(tempDir, "test", suffix).toFile();
                        });
    }

    private byte[] createPdf(int numPages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            Path pdfPath = tempDir.resolve("input.pdf");
            doc.save(pdfPath.toFile());
            return Files.readAllBytes(pdfPath);
        }
    }

    private void setupFactory() throws IOException {
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());
    }

    @Test
    @DisplayName("Should split 6-page PDF at page 3")
    void shouldSplitAtPage3() throws Exception {
        byte[] pdfBytes = createPdf(6);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPagesRequest request = new SplitPagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("3");

        setupFactory();

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should split all pages individually")
    void shouldSplitAllPages() throws Exception {
        byte[] pdfBytes = createPdf(3);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPagesRequest request = new SplitPagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("1,2,3");

        setupFactory();

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should handle single page PDF")
    void shouldHandleSinglePage() throws Exception {
        byte[] pdfBytes = createPdf(1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPagesRequest request = new SplitPagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("1");

        setupFactory();

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should split with range notation")
    void shouldSplitWithRange() throws Exception {
        byte[] pdfBytes = createPdf(10);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPagesRequest request = new SplitPagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("3,7");

        setupFactory();

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should split 4-page PDF into 2 documents")
    void shouldSplitIntoTwoDocs() throws Exception {
        byte[] pdfBytes = createPdf(4);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPagesRequest request = new SplitPagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("2");

        setupFactory();

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType())
                .isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
    }

    @Test
    @DisplayName("Should split 5-page PDF at last page boundary")
    void shouldSplitAtLastPage() throws Exception {
        byte[] pdfBytes = createPdf(5);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPagesRequest request = new SplitPagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("5");

        setupFactory();

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should handle PDF with all keyword")
    void shouldHandleAllKeyword() throws Exception {
        byte[] pdfBytes = createPdf(3);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPagesRequest request = new SplitPagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("all");

        setupFactory();

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should handle file without extension in original name")
    void shouldHandleFileWithoutExtension() throws Exception {
        byte[] pdfBytes = createPdf(2);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "no_extension", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPagesRequest request = new SplitPagesRequest();
        request.setFileInput(file);
        request.setPageNumbers("1");

        setupFactory();

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
