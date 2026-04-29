package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.SplitPdfByChaptersRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SplitPdfByChaptersControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfMetadataService pdfMetadataService;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private SplitPdfByChaptersController controller;

    @BeforeEach
    void setUp() throws IOException {
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            String suffix = inv.getArgument(0);
                            return Files.createTempFile(tempDir, "test", suffix).toFile();
                        });
    }

    private byte[] createPdfWithBookmarks(int numPages, String... chapterNames) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }

            PDDocumentOutline outline = new PDDocumentOutline();
            doc.getDocumentCatalog().setDocumentOutline(outline);

            int pagesPerChapter = Math.max(1, numPages / Math.max(1, chapterNames.length));
            for (int i = 0; i < chapterNames.length; i++) {
                PDOutlineItem item = new PDOutlineItem();
                item.setTitle(chapterNames[i]);
                int pageIndex = Math.min(i * pagesPerChapter, numPages - 1);
                PDPageFitDestination dest = new PDPageFitDestination();
                dest.setPage(doc.getPage(pageIndex));
                item.setDestination(dest);
                outline.addLast(item);
            }

            Path pdfPath = tempDir.resolve("bookmarks.pdf");
            doc.save(pdfPath.toFile());
            return Files.readAllBytes(pdfPath);
        }
    }

    @Test
    @DisplayName("Should split PDF by chapters")
    void shouldSplitByChapters() throws Exception {
        byte[] pdfBytes = createPdfWithBookmarks(6, "Chapter 1", "Chapter 2", "Chapter 3");
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPdfByChaptersRequest request = new SplitPdfByChaptersRequest();
        request.setFileInput(file);
        request.setBookmarkLevel(0);
        request.setIncludeMetadata(false);
        request.setAllowDuplicates(false);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should split PDF by chapters with duplicates allowed")
    void shouldSplitByChaptersWithDuplicates() throws Exception {
        byte[] pdfBytes = createPdfWithBookmarks(4, "Chapter 1", "Chapter 2");
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPdfByChaptersRequest request = new SplitPdfByChaptersRequest();
        request.setFileInput(file);
        request.setBookmarkLevel(0);
        request.setIncludeMetadata(false);
        request.setAllowDuplicates(true);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should throw for negative bookmark level")
    void shouldThrowForNegativeBookmarkLevel() throws Exception {
        byte[] pdfBytes = createPdfWithBookmarks(2, "Ch1");
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPdfByChaptersRequest request = new SplitPdfByChaptersRequest();
        request.setFileInput(file);
        request.setBookmarkLevel(-1);
        request.setIncludeMetadata(false);
        request.setAllowDuplicates(false);

        assertThrows(IllegalArgumentException.class, () -> controller.splitPdf(request));
    }

    @Test
    @DisplayName("Should throw for PDF without bookmarks")
    void shouldThrowForPdfWithoutBookmarks() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            Path pdfPath = tempDir.resolve("no_bookmarks.pdf");
            doc.save(pdfPath.toFile());
            byte[] pdfBytes = Files.readAllBytes(pdfPath);

            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

            SplitPdfByChaptersRequest request = new SplitPdfByChaptersRequest();
            request.setFileInput(file);
            request.setBookmarkLevel(0);
            request.setIncludeMetadata(false);
            request.setAllowDuplicates(false);

            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenAnswer(
                            inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

            assertThrows(IllegalArgumentException.class, () -> controller.splitPdf(request));
        }
    }

    @Test
    @DisplayName("Should split single chapter PDF")
    void shouldSplitSingleChapter() throws Exception {
        byte[] pdfBytes = createPdfWithBookmarks(3, "Only Chapter");
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPdfByChaptersRequest request = new SplitPdfByChaptersRequest();
        request.setFileInput(file);
        request.setBookmarkLevel(0);
        request.setIncludeMetadata(false);
        request.setAllowDuplicates(false);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should split with metadata included")
    void shouldSplitWithMetadata() throws Exception {
        byte[] pdfBytes = createPdfWithBookmarks(4, "Chapter 1", "Chapter 2");
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPdfByChaptersRequest request = new SplitPdfByChaptersRequest();
        request.setFileInput(file);
        request.setBookmarkLevel(0);
        request.setIncludeMetadata(true);
        request.setAllowDuplicates(false);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));
        when(pdfMetadataService.extractMetadataFromPdf(any(PDDocument.class)))
                .thenReturn(new stirling.software.common.model.PdfMetadata());

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should handle bookmark level 0")
    void shouldHandleBookmarkLevel0() throws Exception {
        byte[] pdfBytes = createPdfWithBookmarks(6, "Part 1", "Part 2", "Part 3");
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPdfByChaptersRequest request = new SplitPdfByChaptersRequest();
        request.setFileInput(file);
        request.setBookmarkLevel(0);
        request.setIncludeMetadata(false);
        request.setAllowDuplicates(false);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("Should handle many chapters")
    void shouldHandleManyChapters() throws Exception {
        byte[] pdfBytes = createPdfWithBookmarks(10, "Ch1", "Ch2", "Ch3", "Ch4", "Ch5");
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SplitPdfByChaptersRequest request = new SplitPdfByChaptersRequest();
        request.setFileInput(file);
        request.setBookmarkLevel(0);
        request.setIncludeMetadata(false);
        request.setAllowDuplicates(true);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        var response = controller.splitPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
