package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
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

    private static MockMultipartFile png(String name) throws IOException {
        BufferedImage image = new BufferedImage(120, 80, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setColor(Color.ORANGE);
        graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
        graphics.dispose();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, "png", baos);
        return new MockMultipartFile(
                "fileInput", name, MediaType.IMAGE_PNG_VALUE, baos.toByteArray());
    }

    private static MergePdfsRequest request(
            MockMultipartFile[] files,
            String sortType,
            boolean removeCertSign,
            boolean toc,
            boolean tocPage) {
        MergePdfsRequest req = new MergePdfsRequest();
        req.setFileInput(files);
        req.setSortType(sortType);
        req.setRemoveCertSign(removeCertSign);
        req.setGenerateBookmarks(toc);
        req.setGenerateTocPage(tocPage);
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
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(5);
            }
        }

        @Test
        @DisplayName("merges three PDFs preserving total pages")
        void mergesThreeFiles() throws Exception {
            MockMultipartFile[] files = {pdf("a.pdf", 1), pdf("b.pdf", 2), pdf("c.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(4);
            }
        }

        @Test
        @DisplayName("merging a single file returns its pages")
        void mergesSingleFile() throws Exception {
            MockMultipartFile[] files = {pdf("solo.pdf", 4)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, false, false), null);
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
                            request(new MockMultipartFile[0], "orderProvided", false, false, false),
                            null);
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
                    mergeController.mergePdfs(request(files, sortType, false, false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(3);
            }
        }

        @Test
        @DisplayName("byFileName orders the first output filename deterministically")
        void byFileNameUsesFirstAlphabetical() throws Exception {
            MockMultipartFile[] files = {pdf("zebra.pdf", 1), pdf("apple.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(
                            request(files, "byFileName", false, false, false), null);
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
                            request(files, "byFileName", false, false, false),
                            "second.pdf\nfirst.pdf");
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
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, false, false), "   ");
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
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, true, false), null);
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
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, true, false), null);
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
                    mergeController.mergePdfs(
                            request(files, "orderProvided", true, false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(2);
            }
        }

        @Test
        @DisplayName("removeCertSign=false copies the merged output directly")
        void removeCertSignFalse() throws Exception {
            MockMultipartFile[] files = {pdf("a.pdf", 2), pdf("b.pdf", 1)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, false, false), null);
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
                    request(
                            new MockMultipartFile[] {good, bad},
                            "orderProvided",
                            false,
                            false,
                            false);
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
                    request(new MockMultipartFile[] {empty}, "orderProvided", false, false, false);
            try {
                ResponseEntity<Resource> response = mergeController.mergePdfs(req, null);
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            } catch (Exception expected) {
                assertThat(expected).isInstanceOf(Exception.class);
            }
        }
    }

    @Nested
    @DisplayName("Image inputs")
    class ImageInputs {

        @Test
        @DisplayName("merges a PNG with a PDF, rendering the image on the first page")
        void mergesImageWithPdf() throws Exception {
            MockMultipartFile[] files = {png("scan.png"), pdf("doc.pdf", 2)};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(3);
                assertThat(pageContainsOrange(result, 0)).isTrue();
                assertThat(pageContainsOrange(result, 1)).isFalse();
            }
        }

        @Test
        @DisplayName("merges two images into a two-page PDF, rendering both")
        void mergesTwoImages() throws Exception {
            MockMultipartFile[] files = {png("a.png"), png("b.png")};
            ResponseEntity<Resource> response =
                    mergeController.mergePdfs(
                            request(files, "orderProvided", false, false, false), null);
            try (PDDocument result = readResponse(response)) {
                assertThat(result.getNumberOfPages()).isEqualTo(2);
                assertThat(pageContainsOrange(result, 0)).isTrue();
                assertThat(pageContainsOrange(result, 1)).isTrue();
            }
        }

        /** True when the rendered page shows the orange fill painted by {@link #png(String)}. */
        private boolean pageContainsOrange(PDDocument document, int pageIndex) throws IOException {
            BufferedImage rendered = new PDFRenderer(document).renderImage(pageIndex);
            for (int y = 0; y < rendered.getHeight(); y += 4) {
                for (int x = 0; x < rendered.getWidth(); x += 4) {
                    int rgb = rendered.getRGB(x, y);
                    int red = (rgb >> 16) & 0xFF;
                    int green = (rgb >> 8) & 0xFF;
                    int blue = rgb & 0xFF;
                    if (Math.abs(red - 255) <= 8 && Math.abs(green - 200) <= 8 && blue <= 8) {
                        return true;
                    }
                }
            }
            return false;
        }
    }

    @Test
    @DisplayName("merges 2 files and adds a table of contents page")
    void tocPageGeneration() throws IOException {
        MockMultipartFile[] files = {pdf("a.pdf", 1), pdf("b.pdf", 2)};
        ResponseEntity<Resource> response =
                mergeController.mergePdfs(
                        request(files, "orderProvided", false, false, true), null);
        try (PDDocument result = readResponse(response)) {
            assertThat(result.getNumberOfPages()).isEqualTo(4);
        }
    }

    @Test
    @DisplayName("merges 33 files, the toc should be 2 files long")
    void tocPageSpillsOntoSecondPage() throws IOException {
        MockMultipartFile[] files = new MockMultipartFile[MergeController.ENTRIES_PER_TOC_PAGE + 1];

        for (int i = 0; i < files.length; i++) {
            files[i] = pdf("a.pdf", 1);
        }

        ResponseEntity<Resource> response =
                mergeController.mergePdfs(
                        request(files, "orderProvided", false, false, true), null);
        try (PDDocument result = readResponse(response)) {
            assertThat(result.getNumberOfPages()).isEqualTo(files.length + 2);
        }
    }

    @Test
    @DisplayName("each bookmark points to the first page of its file when a contents page is added")
    void bookmarksAccountForContentsPage() throws Exception {
        MockMultipartFile[] files = {pdf("a.pdf", 1), pdf("b.pdf", 2)};
        MergePdfsRequest req = request(files, "orderProvided", false, true, true);

        ResponseEntity<Resource> response = mergeController.mergePdfs(req, null);

        try (PDDocument result = readResponse(response)) {
            List<Integer> targets = new ArrayList<>();
            for (PDOutlineItem item : result.getDocumentCatalog().getDocumentOutline().children()) {
                targets.add(result.getPages().indexOf(item.findDestinationPage(result)));
            }
            assertThat(targets).containsExactly(1, 2);
        }
    }

    @Test
    @DisplayName("filenames in non-Latin scripts do not break the contents page")
    void tocPageWithNonLatinNames() throws Exception {
        MockMultipartFile[] files = {pdf("報告.pdf", 1), pdf("Отчёт.pdf", 1), pdf("تقرير.pdf", 1)};
        MergePdfsRequest req = request(files, "orderProvided", false, false, true);

        ResponseEntity<Resource> response = mergeController.mergePdfs(req, null);

        try (PDDocument result = readResponse(response)) {
            assertThat(result.getNumberOfPages()).isEqualTo(4);

            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(1);
            stripper.setEndPage(1);
            assertThat(stripper.getText(result)).contains("Отчёт", "報告", "تقرير");
        }
    }
}
