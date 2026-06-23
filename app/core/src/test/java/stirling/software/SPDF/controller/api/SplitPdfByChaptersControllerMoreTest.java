package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.SplitPdfByChaptersRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;

/**
 * Additional branch coverage for {@link SplitPdfByChaptersController}: nested-bookmark depth
 * limiting, the same-page bookmark merge path, and the AcroForm-bearing branch that routes per
 * chapter through PDFBox instead of JPDFium. All PDFs are built in memory.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SplitPdfByChaptersController additional branch tests")
class SplitPdfByChaptersControllerMoreTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfMetadataService pdfMetadataService;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private SplitPdfByChaptersController controller;

    @BeforeEach
    void setUp() throws IOException {
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        inv ->
                                Files.createTempFile(tempDir, "ch", inv.<String>getArgument(0))
                                        .toFile());
        lenient()
                .when(pdfDocumentFactory.load(any(File.class)))
                .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));
        lenient()
                .when(pdfDocumentFactory.load(any(File.class), eq(true)))
                .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));
    }

    private PDOutlineItem item(PDDocument doc, String title, int pageIndex) {
        PDOutlineItem oi = new PDOutlineItem();
        oi.setTitle(title);
        PDPageFitDestination dest = new PDPageFitDestination();
        dest.setPage(doc.getPage(pageIndex));
        oi.setDestination(dest);
        return oi;
    }

    private MockMultipartFile asFile(byte[] bytes) {
        return new MockMultipartFile(
                "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, bytes);
    }

    private SplitPdfByChaptersRequest request(byte[] bytes, int level, boolean dupes) {
        SplitPdfByChaptersRequest req = new SplitPdfByChaptersRequest();
        req.setFileInput(asFile(bytes));
        req.setBookmarkLevel(level);
        req.setIncludeMetadata(false);
        req.setAllowDuplicates(dupes);
        return req;
    }

    private List<byte[]> unzip(Resource zip) throws IOException {
        List<byte[]> out = new ArrayList<>();
        try (ZipInputStream zis =
                new ZipInputStream(new ByteArrayInputStream(zip.getContentAsByteArray()))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                out.add(zis.readAllBytes());
                zis.closeEntry();
            }
        }
        return out;
    }

    private int totalPages(List<byte[]> entries) throws IOException {
        int total = 0;
        for (byte[] data : entries) {
            try (PDDocument doc = Loader.loadPDF(data)) {
                total += doc.getNumberOfPages();
            }
        }
        return total;
    }

    @Nested
    @DisplayName("Nested bookmarks")
    class NestedBookmarks {

        /** Builds a doc with top-level chapters, each carrying one child bookmark. */
        private byte[] nestedDoc() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                for (int i = 0; i < 8; i++) {
                    doc.addPage(new PDPage(PDRectangle.A4));
                }
                PDDocumentOutline outline = new PDDocumentOutline();
                doc.getDocumentCatalog().setDocumentOutline(outline);

                PDOutlineItem chapter1 = item(doc, "Chapter 1", 0);
                chapter1.addLast(item(doc, "Section 1.1", 2));
                outline.addLast(chapter1);

                PDOutlineItem chapter2 = item(doc, "Chapter 2", 4);
                chapter2.addLast(item(doc, "Section 2.1", 6));
                outline.addLast(chapter2);

                Path p = tempDir.resolve("nested.pdf");
                doc.save(p.toFile());
                return Files.readAllBytes(p);
            }
        }

        @Test
        @DisplayName("level 0 collects only top-level chapters")
        void levelZeroTopLevelOnly() throws Exception {
            ResponseEntity<Resource> response = controller.splitPdf(request(nestedDoc(), 0, true));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            List<byte[]> outputs = unzip(response.getBody());
            // Only the 2 top-level chapters become split points at level 0.
            assertThat(outputs).hasSize(2);
            assertThat(totalPages(outputs)).isEqualTo(8);
        }

        @Test
        @DisplayName("a deeper level descends into child bookmarks")
        void deeperLevelIncludesChildren() throws Exception {
            int topLevelCount =
                    unzip(controller.splitPdf(request(nestedDoc(), 0, true)).getBody()).size();

            ResponseEntity<Resource> response = controller.splitPdf(request(nestedDoc(), 2, true));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            List<byte[]> outputs = unzip(response.getBody());
            // Descending into children yields at least as many split points as the top level.
            assertThat(outputs.size()).isGreaterThanOrEqualTo(topLevelCount);
            assertThat(totalPages(outputs)).isEqualTo(8);
        }
    }

    @Nested
    @DisplayName("Same-page bookmark merge")
    class SamePageMerge {

        @Test
        @DisplayName("bookmarks on the same page are merged when duplicates are disallowed")
        void mergesSamePageBookmarks() throws Exception {
            byte[] bytes;
            try (PDDocument doc = new PDDocument()) {
                for (int i = 0; i < 4; i++) {
                    doc.addPage(new PDPage(PDRectangle.A4));
                }
                PDDocumentOutline outline = new PDDocumentOutline();
                doc.getDocumentCatalog().setDocumentOutline(outline);
                // Two bookmarks both pointing at page index 0 -> same start/end -> merged.
                outline.addLast(item(doc, "Intro A", 0));
                outline.addLast(item(doc, "Intro B", 0));
                outline.addLast(item(doc, "Body", 2));
                Path p = tempDir.resolve("samepage.pdf");
                doc.save(p.toFile());
                bytes = Files.readAllBytes(p);
            }

            ResponseEntity<Resource> response = controller.splitPdf(request(bytes, 0, false));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            List<byte[]> outputs = unzip(response.getBody());
            // The two same-page intros collapse, leaving fewer outputs than bookmarks.
            assertThat(outputs.size()).isLessThan(3);
            assertThat(totalPages(outputs)).isGreaterThan(0);
        }
    }

    @Nested
    @DisplayName("Form-bearing PDFs route through PDFBox")
    class FormBearing {

        private byte[] formDocWithBookmarks() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDAcroForm acroForm = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(acroForm);
                for (int i = 0; i < 4; i++) {
                    PDPage page = new PDPage(PDRectangle.A4);
                    doc.addPage(page);
                    PDTextField field = new PDTextField(acroForm);
                    field.setPartialName("text_p" + (i + 1));
                    PDAnnotationWidget widget = new PDAnnotationWidget();
                    widget.setRectangle(new PDRectangle(100, 700, 200, 20));
                    widget.setPage(page);
                    field.setWidgets(List.of(widget));
                    page.getAnnotations().add(widget);
                    acroForm.getFields().add(field);
                }
                PDDocumentOutline outline = new PDDocumentOutline();
                doc.getDocumentCatalog().setDocumentOutline(outline);
                outline.addLast(item(doc, "Chapter 1", 0));
                outline.addLast(item(doc, "Chapter 2", 2));

                Path p = tempDir.resolve("form.pdf");
                doc.save(p.toFile());
                return Files.readAllBytes(p);
            }
        }

        @Test
        @DisplayName("a PDF with an AcroForm still splits into the expected chapters")
        void formPdfSplits() throws Exception {
            ResponseEntity<Resource> response =
                    controller.splitPdf(request(formDocWithBookmarks(), 0, true));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            List<byte[]> outputs = unzip(response.getBody());
            assertThat(outputs).hasSize(2);
            assertThat(totalPages(outputs)).isEqualTo(4);
        }
    }
}
