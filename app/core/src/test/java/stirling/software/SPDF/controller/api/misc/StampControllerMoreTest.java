package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.AddStampRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * End-to-end coverage for {@link StampController#addStamp} using real in-memory PDFs and a real
 * {@link CustomPDFDocumentFactory}/{@link TempFileManager}. Exercises the text and image stamping
 * paths, the 1-9 position grid, rotation, opacity, override coordinates, margins, colours and the
 * validation branches that the reflection-based {@code StampControllerTest} does not reach.
 */
class StampControllerMoreTest {

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;
    private StampController stampController;

    @BeforeEach
    void setUp() {
        pdfDocumentFactory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
        tempFileManager = new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
        stampController = new StampController(pdfDocumentFactory, tempFileManager);
    }

    // ---- helpers ------------------------------------------------------------

    /** Build a multi-page PDF (A4) with a little text drawn on each page. */
    private static byte[] buildPdf(int pageCount) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(72, 720);
                    cs.showText("Page " + (i + 1));
                    cs.endText();
                }
            }
            document.save(baos);
            return baos.toByteArray();
        }
    }

    private static MockMultipartFile pdfFile(int pageCount) throws IOException {
        return new MockMultipartFile(
                "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, buildPdf(pageCount));
    }

    /** Build a small PNG image as a multipart file. */
    private static MockMultipartFile pngImage(String name) throws IOException {
        BufferedImage img = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = img.createGraphics();
        g.setColor(java.awt.Color.RED);
        g.fillRect(0, 0, 40, 20);
        g.dispose();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", baos);
        return new MockMultipartFile(
                "stampImage", name, MediaType.IMAGE_PNG_VALUE, baos.toByteArray());
    }

    /** A request prefilled with sensible defaults; tests override what they need. */
    private static AddStampRequest baseRequest(MultipartFile pdf) {
        AddStampRequest req = new AddStampRequest();
        req.setFileInput(pdf);
        req.setPageNumbers("all");
        req.setStampType("text");
        req.setStampText("Confidential");
        req.setAlphabet("roman");
        req.setFontSize(30f);
        req.setRotation(0f);
        req.setOpacity(0.5f);
        req.setPosition(5);
        req.setOverrideX(-1f);
        req.setOverrideY(-1f);
        req.setCustomMargin("medium");
        req.setCustomColor("#d3d3d3");
        return req;
    }

    /** Read the response body back into a PDDocument and assert page count. */
    private static void assertValidPdf(ResponseEntity<Resource> response, int expectedPages)
            throws IOException {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        byte[] out;
        try (InputStream is = response.getBody().getInputStream()) {
            out = is.readAllBytes();
        }
        assertThat(out.length).isGreaterThan(0);
        try (PDDocument result = Loader.loadPDF(out)) {
            assertThat(result.getNumberOfPages()).isEqualTo(expectedPages);
        }
    }

    @Nested
    @DisplayName("Text stamp happy paths")
    class TextStamp {

        @Test
        @DisplayName("stamps text on a single-page PDF using positional placement")
        void textStampSinglePage() throws Exception {
            ResponseEntity<Resource> response = stampController.addStamp(baseRequest(pdfFile(1)));
            assertValidPdf(response, 1);
        }

        @Test
        @DisplayName("stamps text on every page of a multi-page PDF")
        void textStampMultiPage() throws Exception {
            ResponseEntity<Resource> response = stampController.addStamp(baseRequest(pdfFile(3)));
            assertValidPdf(response, 3);
        }

        @ParameterizedTest
        @ValueSource(ints = {1, 2, 3, 4, 5, 6, 7, 8, 9})
        @DisplayName("covers each of the 1-9 grid positions")
        void textStampAllPositions(int position) throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setPosition(position);
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @Test
        @DisplayName("applies rotation to the text stamp")
        void textStampRotated() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setRotation(45f);
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @Test
        @DisplayName("honours explicit override X/Y coordinates")
        void textStampOverrideCoords() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setOverrideX(100f);
            req.setOverrideY(200f);
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @Test
        @DisplayName("handles multi-line stamp text with escaped newlines")
        void textStampMultiLine() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setStampText("Line one\\nLine two\\nLine three");
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @Test
        @DisplayName("zero font size falls back to default size")
        void textStampZeroFontSize() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setFontSize(0f);
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @ParameterizedTest
        @CsvSource({"small", "medium", "large", "x-large", "unknown-defaults-to-medium"})
        @DisplayName("covers every margin bucket plus the default fallback")
        void textStampMargins(String margin) throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setCustomMargin(margin);
            assertValidPdf(stampController.addStamp(req), 1);
        }
    }

    @Nested
    @DisplayName("Colour handling")
    class ColourHandling {

        @Test
        @DisplayName("accepts a colour without a leading hash")
        void colourWithoutHash() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setCustomColor("ff0000");
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @Test
        @DisplayName("accepts a colour with a leading hash")
        void colourWithHash() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setCustomColor("#00ff00");
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @Test
        @DisplayName("falls back to light gray on an unparseable colour")
        void colourInvalidFallsBack() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setCustomColor("not-a-color");
            assertValidPdf(stampController.addStamp(req), 1);
        }
    }

    @Nested
    @DisplayName("Alphabet font selection")
    class AlphabetSelection {

        // Only alphabets whose fonts are bundled under static/fonts are exercised here. Each case
        // stamps text in its own script so the embedded font has glyphs for every character.
        @ParameterizedTest
        @CsvSource({
            "roman,Confidential",
            "unknown,Confidential",
            "arabic,ابج", // Arabic letters present in NotoSansArabic
            "thai,กขค" // Thai letters present in NotoSansThai
        })
        @DisplayName("loads the matching embedded font for supported alphabets")
        void supportedAlphabets(String alphabet, String stampText) throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setAlphabet(alphabet);
            req.setStampText(stampText);
            assertValidPdf(stampController.addStamp(req), 1);
        }
    }

    @Nested
    @DisplayName("Page selection")
    class PageSelection {

        @Test
        @DisplayName("stamps only the requested subset of pages")
        void stampsPageSubset() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(5));
            req.setPageNumbers("1,3");
            assertValidPdf(stampController.addStamp(req), 5);
        }

        @Test
        @DisplayName("functional page expression selects pages without error")
        void stampsFunctionalPages() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(6));
            req.setPageNumbers("2n");
            assertValidPdf(stampController.addStamp(req), 6);
        }
    }

    @Nested
    @DisplayName("Image stamp happy paths")
    class ImageStamp {

        @Test
        @DisplayName("stamps an image watermark with positional placement")
        void imageStampPositional() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setStampType("image");
            req.setStampImage(pngImage("logo.png"));
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @ParameterizedTest
        @ValueSource(ints = {1, 5, 9})
        @DisplayName("covers top/middle/bottom image position rows")
        void imageStampPositions(int position) throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setStampType("image");
            req.setPosition(position);
            req.setStampImage(pngImage("logo.png"));
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @Test
        @DisplayName("rotates and clamps an image stamp at override coords")
        void imageStampRotatedOverride() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setStampType("image");
            req.setRotation(30f);
            req.setOverrideX(10f);
            req.setOverrideY(10f);
            req.setStampImage(pngImage("logo.png"));
            assertValidPdf(stampController.addStamp(req), 1);
        }

        @Test
        @DisplayName("stamp type matching is case-insensitive (IMAGE)")
        void imageStampCaseInsensitive() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setStampType("IMAGE");
            req.setStampImage(pngImage("logo.png"));
            assertValidPdf(stampController.addStamp(req), 1);
        }
    }

    @Nested
    @DisplayName("Validation and error branches")
    class Validation {

        @Test
        @DisplayName("rejects a PDF filename containing a path traversal sequence")
        void rejectsTraversalPdfName() throws Exception {
            MockMultipartFile bad =
                    new MockMultipartFile(
                            "fileInput",
                            "../evil.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdf(1));
            AddStampRequest req = baseRequest(bad);
            assertThatThrownBy(() -> stampController.addStamp(req))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("rejects a PDF filename starting with a slash")
        void rejectsAbsolutePdfName() throws Exception {
            MockMultipartFile bad =
                    new MockMultipartFile(
                            "fileInput",
                            "/etc/passwd.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdf(1));
            AddStampRequest req = baseRequest(bad);
            assertThatThrownBy(() -> stampController.addStamp(req))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("image stamp type without an image file is rejected")
        void rejectsMissingImage() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setStampType("image");
            req.setStampImage(null);
            assertThatThrownBy(() -> stampController.addStamp(req))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("image filename with a path traversal sequence is rejected")
        void rejectsTraversalImageName() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(1));
            req.setStampType("image");
            req.setStampImage(pngImage("../evil.png"));
            assertThatThrownBy(() -> stampController.addStamp(req))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("unknown stamp type is a no-op that still returns the PDF")
        void unknownStampTypeIsNoOp() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(2));
            req.setStampType("neither");
            assertValidPdf(stampController.addStamp(req), 2);
        }
    }
}
