package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.Mockito.mock;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
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

    private record ContentMatrix(float a, float b, float c, float d, float e, float f) {}

    @BeforeEach
    void setUp() {
        pdfDocumentFactory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
        tempFileManager = new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
        stampController = new StampController(pdfDocumentFactory, tempFileManager);
    }

    // ---- helpers ------------------------------------------------------------

    /** Build a multi-page PDF (A4) with a little text drawn on each page. */
    private static byte[] buildPdf(int pageCount) throws IOException {
        return buildPdf(pageCount, PDRectangle.A4, 0);
    }

    /** Build a multi-page PDF with a little text drawn on each page. */
    private static byte[] buildPdf(int pageCount, PDRectangle pageSize, int pageRotation)
            throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(pageSize);
                page.setRotation(pageRotation);
                document.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(72, Math.max(12, pageSize.getHeight() - 72));
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

    private static MockMultipartFile pdfFile(PDRectangle pageSize, int pageRotation)
            throws IOException {
        return new MockMultipartFile(
                "fileInput",
                "input.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                buildPdf(1, pageSize, pageRotation));
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

    private static byte[] responseBytes(ResponseEntity<Resource> response) throws IOException {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        try (InputStream is = response.getBody().getInputStream()) {
            return is.readAllBytes();
        }
    }

    /** Read the response body back into a PDDocument and assert page count. */
    private static void assertValidPdf(ResponseEntity<Resource> response, int expectedPages)
            throws IOException {
        byte[] out = responseBytes(response);
        assertThat(out.length).isGreaterThan(0);
        try (PDDocument result = Loader.loadPDF(out)) {
            assertThat(result.getNumberOfPages()).isEqualTo(expectedPages);
        }
    }

    private ContentMatrix stampTranslationMatrix(AddStampRequest req) throws Exception {
        byte[] out = responseBytes(stampController.addStamp(req));
        try (PDDocument result = Loader.loadPDF(out)) {
            List<ContentMatrix> translations =
                    contentMatrices(result.getPage(0)).stream()
                            .filter(StampControllerMoreTest::isNonZeroTranslation)
                            .toList();
            assertThat(translations).hasSize(1);
            return translations.get(0);
        }
    }

    private static List<ContentMatrix> contentMatrices(PDPage page) throws IOException {
        PDFStreamParser parser = new PDFStreamParser(page);
        List<Object> tokens = new ArrayList<>();
        Object token;
        while ((token = parser.parseNextToken()) != null) {
            tokens.add(token);
        }

        List<ContentMatrix> matrices = new ArrayList<>();
        for (int i = 6; i < tokens.size(); i++) {
            if (tokens.get(i) instanceof Operator operator && "cm".equals(operator.getName())) {
                matrices.add(
                        new ContentMatrix(
                                numberToken(tokens, i - 6),
                                numberToken(tokens, i - 5),
                                numberToken(tokens, i - 4),
                                numberToken(tokens, i - 3),
                                numberToken(tokens, i - 2),
                                numberToken(tokens, i - 1)));
            }
        }
        return matrices;
    }

    private static float numberToken(List<Object> tokens, int index) {
        assertThat(tokens.get(index)).isInstanceOf(COSNumber.class);
        return ((COSNumber) tokens.get(index)).floatValue();
    }

    private static boolean isNonZeroTranslation(ContentMatrix matrix) {
        return isCloseTo(matrix.a(), 1f)
                && isCloseTo(matrix.b(), 0f)
                && isCloseTo(matrix.c(), 0f)
                && isCloseTo(matrix.d(), 1f)
                && (!isCloseTo(matrix.e(), 0f) || !isCloseTo(matrix.f(), 0f));
    }

    private static boolean isCloseTo(float actual, float expected) {
        return Math.abs(actual - expected) < 0.001f;
    }

    private static void assertTranslation(
            ContentMatrix matrix, float expectedX, float expectedY) {
        assertThat(matrix.e()).isCloseTo(expectedX, within(0.5f));
        assertThat(matrix.f()).isCloseTo(expectedY, within(0.5f));
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
        @DisplayName("non-rotated page keeps override image coordinates inside bounds")
        void imageStampOverrideCoordinatesNonRotated() throws Exception {
            AddStampRequest req = baseRequest(pdfFile(new PDRectangle(792, 612), 0));
            req.setStampType("image");
            req.setFontSize(40f);
            req.setOverrideX(100f);
            req.setOverrideY(200f);
            req.setStampImage(pngImage("logo.png"));

            ContentMatrix matrix = stampTranslationMatrix(req);

            assertTranslation(matrix, 100f, 200f);
        }

        @ParameterizedTest
        @CsvSource({
            "90, 792, 0, 90, 792, 0",
            "180, 792, 612, 180, 792, 612",
            "270, 0, 612, 270, 0, 612"
        })
        @DisplayName("rotated page override coordinates use the rotated image footprint")
        void imageStampOverrideCoordinatesRotatedPages(
                int pageRotation,
                float overrideX,
                float overrideY,
                float stampRotation,
                float expectedX,
                float expectedY)
                throws Exception {
            AddStampRequest req = baseRequest(pdfFile(new PDRectangle(792, 612), pageRotation));
            req.setStampType("image");
            req.setFontSize(40f);
            req.setRotation(stampRotation);
            req.setOverrideX(overrideX);
            req.setOverrideY(overrideY);
            req.setStampImage(pngImage("logo.png"));

            ContentMatrix matrix = stampTranslationMatrix(req);

            assertTranslation(matrix, expectedX, expectedY);
        }

        @Test
        @DisplayName("oversized rotated image stamp remains partially on the visible page")
        void imageStampOversizedRotatedPageConstrained() throws Exception {
            PDRectangle pageSize = new PDRectangle(120, 100);
            AddStampRequest req = baseRequest(pdfFile(pageSize, 270));
            req.setStampType("image");
            req.setFontSize(160f);
            req.setRotation(270f);
            req.setOverrideX(1000f);
            req.setOverrideY(1000f);
            req.setStampImage(pngImage("logo.png"));

            ContentMatrix matrix = stampTranslationMatrix(req);

            assertTranslation(matrix, pageSize.getLowerLeftX(), pageSize.getLowerLeftY() + 320f);
        }

        @ParameterizedTest
        @ValueSource(ints = {0, 90, 180, 270})
        @DisplayName("auto-position image stamp returns a valid PDF on rotated and non-rotated pages")
        void imageStampAutoPositionValidOnRotatedAndNonRotatedPages(int pageRotation)
                throws Exception {
            AddStampRequest req = baseRequest(pdfFile(new PDRectangle(792, 612), pageRotation));
            req.setStampType("image");
            req.setOverrideX(-1f);
            req.setOverrideY(-1f);
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
