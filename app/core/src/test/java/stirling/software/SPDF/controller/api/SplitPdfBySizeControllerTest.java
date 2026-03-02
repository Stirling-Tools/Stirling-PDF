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
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.SplitPdfBySizeOrCountRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class SplitPdfBySizeControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private SplitPdfBySizeController controller;

    @BeforeEach
    void setUp() throws IOException {
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            String suffix = invocation.getArgument(0);
                            return Files.createTempFile(tempDir, "test", suffix).toFile();
                        });
    }

    @Test
    @DisplayName("Should split by page count successfully")
    void shouldSplitByPageCount() throws Exception {
        byte[] pdfBytes;
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < 5; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            Path pdfPath = tempDir.resolve("input.pdf");
            doc.save(pdfPath.toFile());
            pdfBytes = Files.readAllBytes(pdfPath);
        }

        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setFileInput(file);
        request.setSplitType(1); // Page count
        request.setSplitValue("2");

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());

        ResponseEntity<?> response = controller.autoSplitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType())
                .isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
    }

    @Test
    @DisplayName("Should split by document count successfully")
    void shouldSplitByDocCount() throws Exception {
        byte[] pdfBytes;
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < 6; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            Path pdfPath = tempDir.resolve("input.pdf");
            doc.save(pdfPath.toFile());
            pdfBytes = Files.readAllBytes(pdfPath);
        }

        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setFileInput(file);
        request.setSplitType(2); // Document count
        request.setSplitValue("3"); // Split into 3 docs (2 pages each)

        when(pdfDocumentFactory.load(any(org.springframework.web.multipart.MultipartFile.class)))
                .thenAnswer(
                        inv ->
                                Loader.loadPDF(
                                        ((org.springframework.web.multipart.MultipartFile)
                                                        inv.getArgument(0))
                                                .getBytes()));

        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());

        ResponseEntity<?> response = controller.autoSplitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
