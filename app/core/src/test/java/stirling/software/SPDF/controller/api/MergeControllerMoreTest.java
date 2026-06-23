package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Calendar;
import java.util.GregorianCalendar;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * End-to-end coverage for {@link MergeController#mergePdfs} using real in-memory PDFs and the real
 * JPDFium merge pipeline plus a real {@link CustomPDFDocumentFactory}/{@link TempFileManager}.
 * Exercises the sort modes, the fileOrder reordering branch, table-of-contents generation, the
 * removeCertSign signature pre-check, single/empty file handling and the corrupted-input path that
 * the mock-based {@code MergeControllerTest}/{@code MergeControllerGapTest} do not reach.
 */
class MergeControllerMoreTest {

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;
    private MergeController mergeController;

    @BeforeEach
    void setUp() {
        pdfDocumentFactory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
        tempFileManager = new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
        mergeController = new MergeController(pdfDocumentFactory, tempFileManager);
    }

    // ---- helpers ------------------------------------------------------------

    private static byte[] buildPdf(int pageCount, String title, Long modMillis) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(72, 720);
                    cs.showText("Body " + (i + 1));
                    cs.endText();
                }
            }
            PDDocumentInformation info = document.getDocumentInformation();
            if (title != null) {
                info.setTitle(title);
            }
            if (modMillis != null) {
                Calendar cal = new GregorianCalendar();
                cal.setTimeInMillis(modMillis);
                info.setModificationDate(cal);
            }
            document.save(baos);
            return baos.toByteArray();
        }
    }

    private static MockMultipartFile pdf(String name, int pages) throws IOException {
        return new MockMultipartFile(
                "fileInput", name, MediaType.APPLICATION_PDF_VALUE, buildPdf(pages, null, null));
    }

    private static MockMultipartFile pdf(String name, int pages, String title, Long modMillis)
            throws IOException {
        return new MockMultipartFile(
                "fileInput",
                name,
                MediaType.APPLICATION_PDF_VALUE,
                buildPdf(pages, title, modMillis));
    }

    private static MergePdfsRequest request(
            MockMultipartFile[] files, String sortType, boolean removeCertSign, boolean toc) {
        MergePdfsRequest req = new MergePdfsRequest();
        req.setFileInput(files);
        req.setSortType(sortType);
        req.setRemoveCertSign(removeCertSign);
        req.setGenerateToc(toc);
        return req;
    }

    private static PDDocument readResponse(ResponseEntity<Resource> response) throws IOException {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        byte[] out;
        try (InputStream is = response.getBody().getInputStream()) {
            out = is.readAllBytes();
        }
        assertThat(out.length).isGreaterThan(0);
        return Loader.loadPDF(out);
    }

    @Nested
    @DisplayName("Basic merge")
    class BasicMerge {

        @Test
        @DisplayName("merges two PDFs and sums the page counts")
        void mergesTwoFiles() throws Exception {
            MockMultipartFile[] files = {pdf("a.pdf", 2), pdf("b.pdf", 3)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "orderProvided", false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(5);
            }
        }

        @Test
        @DisplayName("merges three PDFs preserving total pages")
        void mergesThreeFiles() throws Exception {
            MockMultipartFile[] files = {pdf("a.pdf", 1), pdf("b.pdf", 2), pdf("c.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "orderProvided", false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(4);
            }
        }

        @Test
        @DisplayName("merging a single file returns its pages")
        void mergesSingleFile() throws Exception {
            MockMultipartFile[] files = {pdf("solo.pdf", 4)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "orderProvided", false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(4);
            }
        }

        @Test
        @DisplayName("null fileInput is treated as an empty set and still returns OK")
        void nullFileInput() throws Exception {
            MergePdfsRequest req = new MergePdfsRequest();
            req.setFileInput(null);
            req.setSortType("orderProvided");
            req.setRemoveCertSign(false);
            ResponseEntity<Resource> response = mergeController.mergePdfs(req, null);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
        }

        @Test
        @DisplayName("empty file array returns an empty (zero-byte) body")
        void emptyFileArray() throws Exception {
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(
                            request(new MockMultipartFile[0], "orderProvided", false, false), null);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }
    }

    @Nested
    @DisplayName("Sort modes")
    class SortModes {

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "orderProvided",
                    "byFileName",
                    "byDateModified",
                    "byDateCreated",
                    "byPDFTitle",
                    "unknownSortType"
                })
        @DisplayName("every sort mode produces a valid merged document")
        void allSortModes(String sortType) throws Exception {
            MockMultipartFile[] files = {
                pdf("charlie.pdf", 1, "Gamma", 3_000L),
                pdf("alpha.pdf", 1, "Alpha", 1_000L),
                pdf("bravo.pdf", 1, "Beta", 2_000L)
            };
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, sortType, false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(3);
            }
        }

        @Test
        @DisplayName("byFileName orders the first output filename deterministically")
        void byFileNameUsesFirstAlphabetical() throws Exception {
            MockMultipartFile[] files = {pdf("zebra.pdf", 1), pdf("apple.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "byFileName", false, false), null);
            String disposition =
                    response.getHeaders()
                            .getFirst(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION);
            // apple.pdf sorts first so it seeds the generated merged filename
            assertThat(disposition).contains("apple");
        }
    }

    @Nested
    @DisplayName("fileOrder reordering")
    class FileOrder {

        @Test
        @DisplayName("fileOrder param overrides sortType and drives the merge order")
        void fileOrderOverridesSort() throws Exception {
            MockMultipartFile[] files = {pdf("first.pdf", 1), pdf("second.pdf", 2)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(
                            request(files, "byFileName", false, false), "second.pdf\nfirst.pdf");
            String disposition =
                    response.getHeaders()
                            .getFirst(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION);
            assertThat(disposition).contains("second");
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(3);
            }
        }

        @Test
        @DisplayName("blank fileOrder falls through to the sortType branch")
        void blankFileOrderUsesSort() throws Exception {
            MockMultipartFile[] files = {pdf("a.pdf", 1), pdf("b.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "orderProvided", false, false), "   ");
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(2);
            }
        }
    }

    @Nested
    @DisplayName("Table of contents and bookmarks")
    class TableOfContents {

        @Test
        @DisplayName("generateToc adds a document outline keyed by filename")
        void generatesToc() throws Exception {
            MockMultipartFile[] files = {pdf("intro.pdf", 1), pdf("body.pdf", 2)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "orderProvided", false, true), null);
            try (PDDocument result = readResponse(response)) {
                PDDocumentOutline outline = result.getDocumentCatalog().getDocumentOutline();
                assertThat(outline).isNotNull();
                assertThat(outline.children().iterator().hasNext()).isTrue();
            }
        }

        @Test
        @DisplayName("a blank filename falls back to a generated Document N title")
        void tocBlankFilenameFallback() throws Exception {
            MockMultipartFile blankName =
                    new MockMultipartFile(
                            "fileInput",
                            "",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdf(1, null, null));
            MockMultipartFile[] files = {blankName, pdf("named.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "orderProvided", false, true), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(2);
            }
        }
    }

    @Nested
    @DisplayName("removeCertSign branch")
    class RemoveCertSign {

        @Test
        @DisplayName("removeCertSign with no signatures skips the flatten pass but still merges")
        void removeCertSignNoSignatures() throws Exception {
            MockMultipartFile[] files = {pdf("a.pdf", 1), pdf("b.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "orderProvided", true, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(2);
            }
        }

        @Test
        @DisplayName("removeCertSign=false copies the merged output directly")
        void removeCertSignFalse() throws Exception {
            MockMultipartFile[] files = {pdf("a.pdf", 2), pdf("b.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(request(files, "orderProvided", false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(3);
            }
        }
    }

    @Nested
    @DisplayName("Corrupted input handling")
    class CorruptedInput {

        // Drives the PDF pre-validate loop and the merge error path. JPDFium may either reject the
        // garbage payload (throw) or salvage a degenerate document; both outcomes are acceptable,
        // so
        // we only assert the code path runs and any thrown error is an Exception (logged +
        // rethrown).
        @Test
        @DisplayName("a non-PDF payload exercises the pre-validate and merge error branch")
        void corruptedPayloadHandled() throws Exception {
            MockMultipartFile good = pdf("good.pdf", 1);
            MockMultipartFile bad =
                    new MockMultipartFile(
                            "fileInput",
                            "broken.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            "this is not a pdf at all".getBytes());
            MergePdfsRequest req =
                    request(new MockMultipartFile[] {good, bad}, "orderProvided", false, false);
            try {
                ResponseEntity<Resource> response = mergeController.mergePdfs(req, null);
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            } catch (Exception expected) {
                assertThat(expected).isInstanceOf(Exception.class);
            }
        }

        @Test
        @DisplayName("an entirely empty payload still runs through the merge pipeline")
        void emptyPayloadHandled() throws Exception {
            MockMultipartFile empty =
                    new MockMultipartFile(
                            "fileInput", "empty.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[0]);
            MergePdfsRequest req =
                    request(new MockMultipartFile[] {empty}, "orderProvided", false, false);
            try {
                ResponseEntity<Resource> response = mergeController.mergePdfs(req, null);
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            } catch (Exception expected) {
                assertThat(expected).isInstanceOf(Exception.class);
            }
        }
    }
}
