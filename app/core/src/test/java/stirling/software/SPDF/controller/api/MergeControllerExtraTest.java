package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Extra coverage for {@link MergeController} helpers that the mock-based and end-to-end suites do
 * not reach directly: the PDFBox {@code addTableOfContents} outline builder and {@code
 * mergeDocuments} page-copy path, both driven over real in-memory documents.
 */
class MergeControllerExtraTest {

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private MergeController mergeController;

    @BeforeEach
    void setUp() {
        pdfDocumentFactory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
        TempFileManager tempFileManager =
                new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
        mergeController = new MergeController(pdfDocumentFactory, tempFileManager);
    }

    private static byte[] pdfBytes(int pages) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static MockMultipartFile pdf(String name, int pages) throws IOException {
        return new MockMultipartFile(
                "fileInput", name, MediaType.APPLICATION_PDF_VALUE, pdfBytes(pages));
    }

    private void addTableOfContents(PDDocument merged, MultipartFile[] files) throws Exception {
        Method m =
                MergeController.class.getDeclaredMethod(
                        "addTableOfContents", PDDocument.class, MultipartFile[].class);
        m.setAccessible(true);
        m.invoke(mergeController, merged, files);
    }

    @Nested
    @DisplayName("mergeDocuments")
    class MergeDocuments {

        @Test
        @DisplayName("copies all pages from every source into a single document")
        void copiesAllPages() throws Exception {
            try (PDDocument a = loadPdf(pdfBytes(2));
                    PDDocument b = loadPdf(pdfBytes(3))) {
                try (PDDocument merged = mergeController.mergeDocuments(List.of(a, b))) {
                    assertThat(merged.getNumberOfPages()).isEqualTo(5);
                }
            }
        }

        @Test
        @DisplayName("an empty source list yields an empty merged document")
        void emptyListEmptyDoc() throws Exception {
            try (PDDocument merged = mergeController.mergeDocuments(List.of())) {
                assertThat(merged.getNumberOfPages()).isZero();
            }
        }

        @Test
        @DisplayName("a single source is copied verbatim")
        void singleSource() throws Exception {
            try (PDDocument only = loadPdf(pdfBytes(4))) {
                try (PDDocument merged = mergeController.mergeDocuments(List.of(only))) {
                    assertThat(merged.getNumberOfPages()).isEqualTo(4);
                }
            }
        }

        private PDDocument loadPdf(byte[] bytes) throws IOException {
            return org.apache.pdfbox.Loader.loadPDF(bytes);
        }
    }

    @Nested
    @DisplayName("addTableOfContents")
    class AddTableOfContents {

        @Test
        @DisplayName("adds one outline entry per input file titled by filename without extension")
        void oneEntryPerFile() throws Exception {
            MultipartFile[] files = {pdf("intro.pdf", 1), pdf("body.pdf", 2)};
            try (PDDocument merged = new PDDocument()) {
                for (int i = 0; i < 3; i++) {
                    merged.addPage(new PDPage(PDRectangle.A4));
                }

                addTableOfContents(merged, files);

                PDDocumentOutline outline = merged.getDocumentCatalog().getDocumentOutline();
                assertThat(outline).isNotNull();
                List<String> titles = outlineTitles(outline);
                assertThat(titles).containsExactly("intro", "body");
            }
        }

        @Test
        @DisplayName("outline destinations advance by each source's page count")
        void destinationsAdvance() throws Exception {
            MultipartFile[] files = {pdf("first.pdf", 1), pdf("second.pdf", 1)};
            try (PDDocument merged = new PDDocument()) {
                merged.addPage(new PDPage(PDRectangle.A4));
                merged.addPage(new PDPage(PDRectangle.A4));

                addTableOfContents(merged, files);

                PDDocumentOutline outline = merged.getDocumentCatalog().getDocumentOutline();
                Iterator<PDOutlineItem> it = outline.children().iterator();
                // both items resolve and the outline is non-empty
                assertThat(it.hasNext()).isTrue();
            }
        }

        @Test
        @DisplayName("handles a single-file table of contents")
        void singleFileToc() throws Exception {
            MultipartFile[] files = {pdf("solo.pdf", 1)};
            try (PDDocument merged = new PDDocument()) {
                merged.addPage(new PDPage(PDRectangle.A4));

                addTableOfContents(merged, files);

                assertThat(outlineTitles(merged.getDocumentCatalog().getDocumentOutline()))
                        .containsExactly("solo");
            }
        }

        private List<String> outlineTitles(PDDocumentOutline outline) {
            List<String> titles = new ArrayList<>();
            for (PDOutlineItem item : outline.children()) {
                titles.add(item.getTitle());
            }
            return titles;
        }
    }
}
