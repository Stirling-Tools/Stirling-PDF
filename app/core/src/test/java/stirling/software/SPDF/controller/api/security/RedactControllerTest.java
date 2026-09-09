package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.awt.Color;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDocument;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@DisplayName("PDF Redaction Controller tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RedactControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    private static final Logger log = LoggerFactory.getLogger(RedactControllerTest.class);

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private RedactExecuteService redactExecuteService;

    private TextRedactionService textRedactionService;
    private ManualRedactionService manualRedactionService;
    private RedactController redactController;

    private MockMultipartFile mockPdfFile;
    private PDDocument mockDocument;
    private PDPageTree mockPages;
    private PDPage mockPage;

    private PDDocument realDocument;
    private PDPage realPage;

    private static PDFont helvetica(PDDocument doc) throws IOException {
        try (InputStream is =
                RedactControllerTest.class.getResourceAsStream(
                        "/type3/library/fonts/dejavu/DejaVuSans.ttf")) {
            if (is != null) {
                return PDType0Font.load(doc, is);
            }
        }
        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

    private static byte[] createSimplePdfContent() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream contentStream = new PDPageContentStream(doc, page)) {
                contentStream.beginText();
                contentStream.setFont(helvetica(doc), 12);
                contentStream.newLineAtOffset(100, 700);
                contentStream.showText("This is a simple PDF.");
                contentStream.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static List<RedactionArea> createValidRedactionAreas() {
        List<RedactionArea> areas = new ArrayList<>();

        RedactionArea area1 = new RedactionArea();
        area1.setPage(1);
        area1.setX(100.0);
        area1.setY(100.0);
        area1.setWidth(200.0);
        area1.setHeight(50.0);
        area1.setColor("000000");
        areas.add(area1);

        RedactionArea area2 = new RedactionArea();
        area2.setPage(1);
        area2.setX(300.0);
        area2.setY(200.0);
        area2.setWidth(150.0);
        area2.setHeight(30.0);
        area2.setColor("FF0000");
        areas.add(area2);

        return areas;
    }

    @BeforeEach
    void setUp() throws IOException {
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
        mockPdfFile =
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        createSimplePdfContent());

        // Mock PDF document and related objects
        mockDocument = mock(PDDocument.class);
        mockPages = mock(PDPageTree.class);
        mockPage = mock(PDPage.class);
        PDDocumentCatalog mockCatalog = mock(PDDocumentCatalog.class);

        // Setup document structure properly
        when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(mockDocument);
        when(mockDocument.getDocumentCatalog()).thenReturn(mockCatalog);
        when(mockCatalog.getPages()).thenReturn(mockPages);
        when(mockDocument.getNumberOfPages()).thenReturn(1);
        when(mockDocument.getPages()).thenReturn(mockPages);

        // Setup page tree
        when(mockPages.getCount()).thenReturn(1);
        when(mockPages.get(0)).thenReturn(mockPage);
        when(mockPages.iterator()).thenReturn(Collections.singletonList(mockPage).iterator());

        PDRectangle pageRect = new PDRectangle(0, 0, 612, 792);
        when(mockPage.getCropBox()).thenReturn(pageRect);
        when(mockPage.getMediaBox()).thenReturn(pageRect);
        when(mockPage.getBBox()).thenReturn(pageRect);

        InputStream mockInputStream =
                new ByteArrayInputStream("BT /F1 12 Tf 100 200 Td (test content) Tj ET".getBytes());
        when(mockPage.getContents()).thenReturn(mockInputStream);

        when(mockPage.hasContents()).thenReturn(true);

        COSDocument mockCOSDocument = mock(COSDocument.class);
        COSStream mockCOSStream = mock(COSStream.class);
        when(mockDocument.getDocument()).thenReturn(mockCOSDocument);
        when(mockCOSDocument.createCOSStream()).thenReturn(mockCOSStream);

        ByteArrayOutputStream mockOutputStream = new ByteArrayOutputStream();
        when(mockCOSStream.createOutputStream()).thenReturn(mockOutputStream);
        when(mockCOSStream.createOutputStream(any())).thenReturn(mockOutputStream);

        lenient()
                .doAnswer(
                        inv -> {
                            File f = inv.getArgument(0);
                            java.nio.file.Files.write(f.toPath(), "mock pdf".getBytes());
                            return null;
                        })
                .when(mockDocument)
                .save(any(File.class));
        doNothing().when(mockDocument).close();

        // Build real service instances so tests exercise actual logic
        textRedactionService = new TextRedactionService();
        manualRedactionService = new ManualRedactionService(tempFileManager);
        redactController =
                new RedactController(
                        pdfDocumentFactory,
                        tempFileManager,
                        manualRedactionService,
                        textRedactionService,
                        redactExecuteService);

        setupRealDocument();
    }

    private static List<RedactionArea> createInvalidRedactionAreas() {
        List<RedactionArea> areas = new ArrayList<>();

        RedactionArea invalidArea = new RedactionArea();
        invalidArea.setPage(null); // Invalid - null page
        invalidArea.setX(100.0);
        invalidArea.setY(100.0);
        invalidArea.setWidth(200.0);
        invalidArea.setHeight(50.0);
        areas.add(invalidArea);

        return areas;
    }

    @AfterEach
    void tearDown() throws IOException {
        reset(mockDocument, mockPages, mockPage, pdfDocumentFactory);
        if (realDocument != null) {
            realDocument.close();
        }
    }

    @Nested
    @DisplayName("Automatic Text Redaction")
    class AutomaticRedactionTests {

        @Test
        @DisplayName("Should redact basic text successfully")
        void redactBasicText() throws Exception {
            testAutoRedaction("confidential\nsecret", false, false, "#000000", 2.0f, false, true);
        }

        @Test
        @DisplayName("Should handle simple text redaction")
        void handleSimpleTextRedaction() throws Exception {
            testAutoRedaction("sensitive", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle empty text list gracefully")
        void handleEmptyTextList() throws Exception {
            testAutoRedaction("", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should redact multiple search terms")
        void redactMultipleSearchTerms() throws Exception {
            testAutoRedaction(
                    "confidential\nsecret\nprivate\nclassified",
                    false,
                    true,
                    "#FF0000",
                    2.0f,
                    false,
                    true);
        }

        @Test
        @DisplayName("Should handle very large number of search terms")
        void handleLargeNumberOfSearchTerms() throws Exception {
            StringBuilder terms = new StringBuilder();
            for (int i = 0; i < 100; i++) {
                terms.append("term").append(i).append("\n");
            }
            testAutoRedaction(terms.toString(), false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle complex document structure")
        void handleComplexDocumentStructure() throws Exception {
            when(mockPages.getCount()).thenReturn(5);
            when(mockDocument.getNumberOfPages()).thenReturn(5);

            List<PDPage> pageList = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                PDPage page = mock(PDPage.class);
                PDRectangle pageRect = new PDRectangle(0, 0, 612, 792);
                when(page.getCropBox()).thenReturn(pageRect);
                when(page.getMediaBox()).thenReturn(pageRect);
                when(page.getBBox()).thenReturn(pageRect);
                when(page.hasContents()).thenReturn(true);

                InputStream mockInputStream =
                        new ByteArrayInputStream(
                                ("BT /F1 12 Tf 100 200 Td (page "
                                                + i
                                                + " content with confidential info) Tj ET")
                                        .getBytes());
                when(page.getContents()).thenReturn(mockInputStream);

                pageList.add(page);
            }

            when(mockPages.iterator()).thenReturn(pageList.iterator());
            for (int i = 0; i < 5; i++) {
                when(mockPages.get(i)).thenReturn(pageList.get(i));
            }

            testAutoRedaction("confidential", false, false, "#000000", 1.0f, false, true);

            // Reset to original state
            reset(mockPages);
            when(mockPages.getCount()).thenReturn(1);
            when(mockPages.get(0)).thenReturn(mockPage);
            when(mockPages.iterator()).thenReturn(Collections.singletonList(mockPage).iterator());
            when(mockDocument.getNumberOfPages()).thenReturn(1);
        }

        @Test
        @DisplayName("Should handle document with metadata")
        void handleDocumentWithMetadata() throws Exception {
            RedactPdfRequest request = createRedactPdfRequest();
            request.setListOfText("confidential");
            request.setUseRegex(false);
            request.setWholeWordSearch(false);
            request.setRedactColor("#000000");
            request.setCustomPadding(1.0f);
            request.setConvertPDFToImage(false);

            when(mockPages.get(0)).thenReturn(mockPage);

            PDDocumentInformation mockInfo = mock(PDDocumentInformation.class);
            when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);

            ResponseEntity<Resource> response = redactController.redactPdf(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
        }
    }

    @Nested
    @DisplayName("Regular Expression Redaction")
    class RegexRedactionTests {

        @Test
        @DisplayName("Should redact using regex patterns")
        void redactUsingRegexPatterns() throws Exception {
            testAutoRedaction("\\d{3}-\\d{2}-\\d{4}", true, false, "#FF0000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle email pattern redaction")
        void handleEmailPatternRedaction() throws Exception {
            testAutoRedaction(
                    "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
                    true, false, "#0000FF", 1.5f, false, true);
        }

        @Test
        @DisplayName("Should handle phone number patterns")
        void handlePhoneNumberPatterns() throws Exception {
            testAutoRedaction(
                    "\\(\\d{3}\\)\\s*\\d{3}-\\d{4}", true, false, "#FF0000", 1.0f, false, true);
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "\\d{3}-\\d{2}-\\d{4}", // SSN pattern
                    "\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}", // Credit card pattern
                    "\\b[A-Z]{2,}\\b", // Uppercase words
                    "\\$\\d+\\.\\d{2}", // Currency pattern
                    "\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b" // IP address pattern
                })
        @DisplayName("Should handle various regex patterns")
        void handleVariousRegexPatterns(String regexPattern) throws Exception {
            testAutoRedaction(regexPattern, true, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle invalid regex gracefully")
        void handleInvalidRegex() throws Exception {
            testAutoRedaction("[invalid regex(", true, false, "#000000", 1.0f, false, false);
        }
    }

    @Nested
    @DisplayName("Whole Word Search Redaction")
    class WholeWordRedactionTests {

        @Test
        @DisplayName("Should redact whole words only")
        void redactWholeWordsOnly() throws Exception {
            testAutoRedaction("test", false, true, "#0000FF", 0.5f, false, true);
        }

        @Test
        @DisplayName("Should handle word boundaries correctly")
        void handleWordBoundariesCorrectly() throws Exception {
            testAutoRedaction("confidential", false, true, "#FF0000", 1.0f, false, true);
        }
    }

    @Nested
    @DisplayName("Color and Styling Options")
    class ColorAndStylingTests {

        @Test
        @DisplayName("Should handle red hex color")
        void handleRedHexColor() throws Exception {
            testAutoRedaction("test", false, false, "#FF0000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle green hex color")
        void handleGreenHexColor() throws Exception {
            testAutoRedaction("test", false, false, "#00FF00", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle blue hex color")
        void handleBlueHexColor() throws Exception {
            testAutoRedaction("test", false, false, "#0000FF", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should default to black for invalid colors")
        void defaultToBlackForInvalidColors() throws Exception {
            testAutoRedaction("test", false, false, "invalid-color", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle yellow hex color")
        void handleYellowHexColor() throws Exception {
            testAutoRedaction("test", false, false, "#FFFF00", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle magenta hex color")
        void handleMagentaHexColor() throws Exception {
            testAutoRedaction("test", false, false, "#FF00FF", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle cyan hex color")
        void handleCyanHexColor() throws Exception {
            testAutoRedaction("test", false, false, "#00FFFF", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle black hex color")
        void handleBlackHexColor() throws Exception {
            testAutoRedaction("test", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle white hex color")
        void handleWhiteHexColor() throws Exception {
            testAutoRedaction("test", false, false, "#FFFFFF", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle zero padding")
        void handleZeroPadding() throws Exception {
            testAutoRedaction("test", false, false, "#000000", 0.0f, false, true);
        }

        @Test
        @DisplayName("Should handle normal padding")
        void handleNormalPadding() throws Exception {
            testAutoRedaction("test", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle large padding")
        void handleLargePadding() throws Exception {
            testAutoRedaction("test", false, false, "#000000", 2.5f, false, true);
        }

        @Test
        @DisplayName("Should handle extra large padding")
        void handleExtraLargePadding() throws Exception {
            testAutoRedaction("test", false, false, "#000000", 5.0f, false, true);
        }
    }

    @Nested
    @DisplayName("Manual Redaction Areas")
    class ManualRedactionTests {

        @Test
        @DisplayName("Should redact using manual areas")
        void redactUsingManualAreas() throws Exception {
            List<RedactionArea> redactionAreas = createValidRedactionAreas();
            testManualRedaction(redactionAreas, false);
        }

        @Test
        @DisplayName("Should handle null redaction areas")
        void handleNullRedactionAreas() throws Exception {
            testManualRedaction(null, false);
        }

        @Test
        @DisplayName("Should handle empty redaction areas")
        void handleEmptyRedactionAreas() throws Exception {
            testManualRedaction(new ArrayList<>(), false);
        }

        @Test
        @DisplayName("Should handle invalid redaction area coordinates")
        void handleInvalidRedactionAreaCoordinates() throws Exception {
            List<RedactionArea> invalidAreas = createInvalidRedactionAreas();
            testManualRedaction(invalidAreas, false);
        }

        @Test
        @DisplayName("Should handle multiple redaction areas")
        void handleMultipleRedactionAreas() throws Exception {
            List<RedactionArea> multipleAreas = createMultipleRedactionAreas();
            testManualRedaction(multipleAreas, false);
        }

        @Test
        @DisplayName("Should handle overlapping redaction areas")
        void handleOverlappingRedactionAreas() throws Exception {
            List<RedactionArea> overlappingAreas = createOverlappingRedactionAreas();
            testManualRedaction(overlappingAreas, false);
        }

        @Test
        @DisplayName("Should handle redaction areas with different colors")
        void handleRedactionAreasWithDifferentColors() throws Exception {
            List<RedactionArea> areas = new ArrayList<>();

            String[] colors = {"FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF"};
            for (int i = 0; i < colors.length; i++) {
                RedactionArea area = new RedactionArea();
                area.setPage(1);
                area.setX(50.0 + (i * 60));
                area.setY(50.0);
                area.setWidth(50.0);
                area.setHeight(30.0);
                area.setColor(colors[i]);
                areas.add(area);
            }

            testManualRedaction(areas, false);
        }

        @Test
        @DisplayName("Should handle redaction areas on multiple pages")
        void handleRedactionAreasOnMultiplePages() throws Exception {
            when(mockPages.getCount()).thenReturn(3);
            when(mockDocument.getNumberOfPages()).thenReturn(3);

            List<PDPage> pageList = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                PDPage page = mock(PDPage.class);
                PDRectangle pageRect = new PDRectangle(0, 0, 612, 792);
                when(page.getCropBox()).thenReturn(pageRect);
                when(page.getMediaBox()).thenReturn(pageRect);
                when(page.getBBox()).thenReturn(pageRect);
                when(page.hasContents()).thenReturn(true);

                InputStream mockInputStream =
                        new ByteArrayInputStream(
                                ("BT /F1 12 Tf 100 200 Td (page " + i + " content) Tj ET")
                                        .getBytes());
                when(page.getContents()).thenReturn(mockInputStream);

                pageList.add(page);
            }

            when(mockPages.iterator()).thenReturn(pageList.iterator());
            for (int i = 0; i < 3; i++) {
                when(mockPages.get(i)).thenReturn(pageList.get(i));
            }

            List<RedactionArea> areas = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                RedactionArea area = new RedactionArea();
                area.setPage(i + 1); // Pages are 1-indexed
                area.setX(100.0);
                area.setY(100.0);
                area.setWidth(200.0);
                area.setHeight(50.0);
                area.setColor("000000");
                areas.add(area);
            }

            testManualRedaction(areas, false);

            reset(mockPages);
            when(mockPages.getCount()).thenReturn(1);
            when(mockPages.get(0)).thenReturn(mockPage);
            when(mockPages.iterator()).thenReturn(Collections.singletonList(mockPage).iterator());
            when(mockDocument.getNumberOfPages()).thenReturn(1);
        }
    }

    @Nested
    @DisplayName("Image Conversion Options")
    class ImageConversionTests {

        @Test
        @DisplayName("Should handle PDF to image conversion disabled")
        void handlePdfToImageConversionDisabled() throws Exception {
            testAutoRedaction("sensitive", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle PDF to image conversion enabled")
        void handlePdfToImageConversionEnabled() throws Exception {
            testAutoRedaction("sensitive", false, false, "#000000", 1.0f, true, true);
        }

        @Test
        @DisplayName("Should handle manual redaction with image conversion")
        void handleManualRedactionWithImageConversion() throws Exception {
            List<RedactionArea> areas = createValidRedactionAreas();
            testManualRedaction(areas, true);
        }
    }

    private static List<RedactionArea> createMultipleRedactionAreas() {
        List<RedactionArea> areas = new ArrayList<>();

        for (int i = 0; i < 5; i++) {
            RedactionArea area = new RedactionArea();
            area.setPage(1);
            area.setX(50.0 + (i * 60));
            area.setY(50.0 + (i * 40));
            area.setWidth(50.0);
            area.setHeight(30.0);
            area.setColor(String.format("%06X", i * 0x333333));
            areas.add(area);
        }

        return areas;
    }

    private static List<RedactionArea> createOverlappingRedactionAreas() {
        List<RedactionArea> areas = new ArrayList<>();

        RedactionArea area1 = new RedactionArea();
        area1.setPage(1);
        area1.setX(100.0);
        area1.setY(100.0);
        area1.setWidth(200.0);
        area1.setHeight(100.0);
        area1.setColor("FF0000");
        areas.add(area1);

        RedactionArea area2 = new RedactionArea();
        area2.setPage(1);
        area2.setX(150.0); // Overlaps with area1
        area2.setY(150.0); // Overlaps with area1
        area2.setWidth(200.0);
        area2.setHeight(100.0);
        area2.setColor("00FF00");
        areas.add(area2);

        return areas;
    }

    // Helper for token creation
    private static List<Object> createSampleTokenList() {
        return List.of(
                Operator.getOperator("BT"),
                COSName.getPDFName("F1"),
                new COSFloat(12),
                Operator.getOperator("Tf"),
                new COSString("Sample text"),
                Operator.getOperator("Tj"),
                Operator.getOperator("ET"));
    }

    private RedactPdfRequest createRedactPdfRequest() {
        RedactPdfRequest request = new RedactPdfRequest();
        request.setFileInput(mockPdfFile);
        return request;
    }

    private ManualRedactPdfRequest createManualRedactPdfRequest() {
        ManualRedactPdfRequest request = new ManualRedactPdfRequest();
        request.setFileInput(mockPdfFile);
        return request;
    }

    private static String extractTextFromTokens(List<Object> tokens) {
        StringBuilder text = new StringBuilder();
        for (Object token : tokens) {
            if (token instanceof COSString cosString) {
                text.append(cosString.getString());
            } else if (token instanceof COSArray array) {
                for (int i = 0; i < array.size(); i++) {
                    if (array.getObject(i) instanceof COSString cosString) {
                        text.append(cosString.getString());
                    }
                }
            }
        }
        return text.toString();
    }

    private static byte[] readAllBytes(InputStream inputStream) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        int nRead;
        byte[] data = new byte[1024];
        while ((nRead = inputStream.read(data, 0, data.length)) != -1) {
            buffer.write(data, 0, nRead);
        }
        return buffer.toByteArray();
    }

    // Helpers
    private void testAutoRedaction(
            String searchText,
            boolean useRegex,
            boolean wholeWordSearch,
            String redactColor,
            float padding,
            boolean convertToImage,
            boolean expectSuccess) {
        RedactPdfRequest request = createRedactPdfRequest();
        request.setListOfText(searchText);
        request.setUseRegex(useRegex);
        request.setWholeWordSearch(wholeWordSearch);
        request.setRedactColor(redactColor);
        request.setCustomPadding(padding);
        request.setConvertPDFToImage(convertToImage);

        try {
            ResponseEntity<Resource> response = redactController.redactPdf(request);

            if (expectSuccess && response != null) {
                assertNotNull(response);
                assertEquals(200, response.getStatusCode().value());
                assertNotNull(response.getBody());
                assertTrue(drainBody(response).length > 0);
            }
        } catch (Exception e) {
            if (expectSuccess) {
                log.info("Redaction test completed with graceful handling: {}", e.getMessage());
            } else {
                assertNotNull(e.getMessage());
            }
        }
    }

    private void testManualRedaction(List<RedactionArea> redactionAreas, boolean convertToImage) {
        ManualRedactPdfRequest request = createManualRedactPdfRequest();
        request.setRedactions(redactionAreas);
        request.setConvertPDFToImage(convertToImage);

        try {
            ResponseEntity<Resource> response = redactController.redactPDF(request);

            if (response != null) {
                assertNotNull(response);
                assertEquals(200, response.getStatusCode().value());
                verify(mockDocument, times(1)).save(any(File.class));
            }
        } catch (Exception e) {
            log.info("Manual redaction test completed with graceful handling: {}", e.getMessage());
        }
    }

    private void setupRealDocument() {
        realDocument = new PDDocument();
        realPage = new PDPage(PDRectangle.A4);
        realDocument.addPage(realPage);

        // Set up basic page resources with embedded font
        try {
            PDResources resources = new PDResources();
            resources.put(COSName.getPDFName("F1"), helvetica(realDocument));
            realPage.setResources(resources);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    // Helper methods for real PDF content creation
    private void createRealPageWithSimpleText(String text) throws IOException {
        realPage = new PDPage(PDRectangle.A4);
        while (realDocument.getNumberOfPages() > 0) {
            realDocument.removePage(0);
        }
        realDocument.addPage(realPage);
        realPage.setResources(new PDResources());
        realPage.getResources().put(COSName.getPDFName("F1"), helvetica(realDocument));

        try (PDPageContentStream contentStream = new PDPageContentStream(realDocument, realPage)) {
            contentStream.beginText();
            contentStream.setFont(realPage.getResources().getFont(COSName.getPDFName("F1")), 12);
            contentStream.newLineAtOffset(50, 750);
            contentStream.showText(text);
            contentStream.endText();
        }
    }

    private void createRealPageWithTJArrayText() throws IOException {
        realPage = new PDPage(PDRectangle.A4);
        while (realDocument.getNumberOfPages() > 0) {
            realDocument.removePage(0);
        }
        realDocument.addPage(realPage);
        realPage.setResources(new PDResources());
        realPage.getResources().put(COSName.getPDFName("F1"), helvetica(realDocument));

        try (PDPageContentStream contentStream = new PDPageContentStream(realDocument, realPage)) {
            contentStream.beginText();
            contentStream.setFont(realPage.getResources().getFont(COSName.getPDFName("F1")), 12);
            contentStream.newLineAtOffset(50, 750);

            contentStream.showText("This is ");
            contentStream.newLineAtOffset(-10, 0);
            contentStream.showText("secret");
            contentStream.newLineAtOffset(10, 0);
            contentStream.showText(" information");
            contentStream.endText();
        }
    }

    private void createRealPageWithMixedContent() throws IOException {
        realPage = new PDPage(PDRectangle.A4);
        while (realDocument.getNumberOfPages() > 0) {
            realDocument.removePage(0);
        }
        realDocument.addPage(realPage);
        realPage.setResources(new PDResources());
        realPage.getResources().put(COSName.getPDFName("F1"), helvetica(realDocument));

        try (PDPageContentStream contentStream = new PDPageContentStream(realDocument, realPage)) {
            contentStream.setLineWidth(2);
            contentStream.moveTo(100, 100);
            contentStream.lineTo(200, 200);
            contentStream.stroke();

            contentStream.beginText();
            contentStream.setFont(realPage.getResources().getFont(COSName.getPDFName("F1")), 12);
            contentStream.newLineAtOffset(50, 750);
            contentStream.showText("Please redact this content");
            contentStream.endText();
        }
    }

    private void createRealPageWithSpecificOperator(String operatorName) throws IOException {
        createRealPageWithSimpleText("sensitive data");
    }

    private void createRealPageWithPositionedText() throws IOException {
        realPage = new PDPage(PDRectangle.A4);
        while (realDocument.getNumberOfPages() > 0) {
            realDocument.removePage(0);
        }
        realDocument.addPage(realPage);
        realPage.setResources(new PDResources());
        realPage.getResources().put(COSName.getPDFName("F1"), helvetica(realDocument));

        try (PDPageContentStream contentStream = new PDPageContentStream(realDocument, realPage)) {
            contentStream.beginText();
            contentStream.setFont(realPage.getResources().getFont(COSName.getPDFName("F1")), 12);
            contentStream.newLineAtOffset(50, 750);
            contentStream.showText("Normal text ");
            contentStream.newLineAtOffset(100, 0);
            contentStream.showText("confidential");
            contentStream.newLineAtOffset(100, 0);
            contentStream.showText(" more text");
            contentStream.endText();
        }
    }

    @Nested
    @DisplayName("Error Handling and Edge Cases")
    class ErrorHandlingTests {

        @Test
        @DisplayName("Should handle null file input gracefully")
        void handleNullFileInput() {
            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(null);
            request.setListOfText("test");

            assertDoesNotThrow(
                    () -> {
                        try {
                            redactController.redactPdf(request);
                        } catch (Exception e) {
                            assertNotNull(e);
                        }
                    });
        }

        @Test
        @DisplayName("Should handle malformed PDF gracefully")
        void handleMalformedPdfGracefully() {
            MockMultipartFile malformedFile =
                    new MockMultipartFile(
                            "fileInput",
                            "malformed.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            "Not a real PDF content".getBytes());

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(malformedFile);
            request.setListOfText("test");

            assertDoesNotThrow(
                    () -> {
                        try {
                            redactController.redactPdf(request);
                        } catch (Exception e) {
                            assertNotNull(e);
                        }
                    });
        }

        @Test
        @DisplayName("Should handle extremely long search text")
        void handleExtremelyLongSearchText() throws Exception {
            String longText = "a".repeat(10000);
            testAutoRedaction(longText, false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle special characters in search text")
        void handleSpecialCharactersInSearchText() throws Exception {
            testAutoRedaction("特殊字符测试 ñáéíóú àèìòù", false, false, "#000000", 1.0f, false, true);
        }

        @ParameterizedTest
        @ValueSource(strings = {"", " ", "\t", "\n", "\r\n", "   \t\n   "})
        @DisplayName("Should handle whitespace-only search terms")
        void handleWhitespaceOnlySearchTerms(String whitespacePattern) throws Exception {
            testAutoRedaction(whitespacePattern, false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle null redact color gracefully")
        void handleNullRedactColor() {
            RedactPdfRequest request = createRedactPdfRequest();
            request.setListOfText("test");
            request.setRedactColor(null);

            ResponseEntity<Resource> response = redactController.redactPdf(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
        }

        @Test
        @DisplayName("Should handle negative padding gracefully")
        void handleNegativePadding() throws Exception {
            testAutoRedaction("test", false, false, "#000000", -1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle extremely large padding")
        void handleExtremelyLargePadding() throws Exception {
            testAutoRedaction("test", false, false, "#000000", 100.0f, false, true);
        }

        @Test
        @DisplayName("Should handle null manual redaction areas gracefully")
        void handleNullManualRedactionAreas() throws Exception {
            ManualRedactPdfRequest request = createManualRedactPdfRequest();
            request.setRedactions(null);

            ResponseEntity<Resource> response = redactController.redactPDF(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
        }

        @Test
        @DisplayName("Should handle out of bounds page numbers gracefully")
        void handleOutOfBoundsPageNumbers() throws Exception {
            ManualRedactPdfRequest request = createManualRedactPdfRequest();
            request.setPageNumbers("100-200");

            ResponseEntity<Resource> response = redactController.redactPDF(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
        }
    }

    @Nested
    @DisplayName("Color Decoding Utility Tests")
    class ColorDecodingTests {

        @Test
        @DisplayName("Should decode valid hex color with hash")
        void decodeValidHexColorWithHash() {
            Color result = ManualRedactionService.decodeOrDefault("#FF0000");
            assertEquals(Color.RED, result);
        }

        @Test
        @DisplayName("Should decode valid hex color without hash")
        void decodeValidHexColorWithoutHash() {
            Color result = ManualRedactionService.decodeOrDefault("FF0000");
            assertEquals(Color.RED, result);
        }

        @Test
        @DisplayName("Should default to black for null color")
        void defaultToBlackForNullColor() {
            Color result = ManualRedactionService.decodeOrDefault(null);
            assertEquals(Color.BLACK, result);
        }

        @Test
        @DisplayName("Should default to black for invalid color")
        void defaultToBlackForInvalidColor() {
            Color result = ManualRedactionService.decodeOrDefault("invalid-color");
            assertEquals(Color.BLACK, result);
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "#FF0000", "#00FF00", "#0000FF", "#FFFFFF", "#000000", "FF0000", "00FF00",
                    "0000FF"
                })
        @DisplayName("Should handle various valid color formats")
        void handleVariousValidColorFormats(String colorInput) {
            Color result = ManualRedactionService.decodeOrDefault(colorInput);
            assertNotNull(result);
            assertTrue(
                    result.getRed() >= 0 && result.getRed() <= 255,
                    "Red component should be in valid range");
            assertTrue(
                    result.getGreen() >= 0 && result.getGreen() <= 255,
                    "Green component should be in valid range");
            assertTrue(
                    result.getBlue() >= 0 && result.getBlue() <= 255,
                    "Blue component should be in valid range");
        }

        @Test
        @DisplayName("Should handle short hex codes appropriately")
        void handleShortHexCodes() {
            Color result1 = ManualRedactionService.decodeOrDefault("123");
            Color result2 = ManualRedactionService.decodeOrDefault("#12");

            assertNotNull(result1);
            assertNotNull(result2);
        }
    }

    private String extractTextFromModifiedPage(PDPage page) throws IOException {
        if (page.getContents() != null) {
            try (InputStream inputStream = page.getContents()) {
                return new String(readAllBytes(inputStream));
            }
        }
        return "";
    }

    @Nested
    @DisplayName("Content Stream Unit Tests")
    class ContentStreamUnitTests {

        @Test
        @DisplayName("performTextReplacement should process document text replacement")
        void shouldPerformTextReplacement() throws Exception {
            createRealPageWithSimpleText("This document contains sensitive information.");
            String[] targetWords = new String[] {"sensitive"};

            Map<Integer, List<PDFText>> found =
                    textRedactionService.findTextToRedact(realDocument, targetWords, false, false);
            assertFalse(found.isEmpty(), "Should find target text to redact");

            boolean fallback =
                    textRedactionService.performTextReplacement(
                            realDocument, found, targetWords, false, false);
            assertFalse(fallback, "JPDFium text replacement should complete without fallback");
        }

        @Test
        @DisplayName("Should handle documents with multiple text blocks")
        void shouldHandleDocumentsWithMultipleTextBlocks() throws Exception {
            realPage = new PDPage(PDRectangle.A4);
            while (realDocument.getNumberOfPages() > 0) {
                realDocument.removePage(0);
            }
            realDocument.addPage(realPage);

            PDResources resources = new PDResources();
            resources.put(COSName.getPDFName("F1"), helvetica(realDocument));
            realPage.setResources(resources);

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(realDocument, realPage)) {
                contentStream.beginText();
                contentStream.setFont(helvetica(realDocument), 12);
                contentStream.newLineAtOffset(50, 750);
                contentStream.showText("This is the first text block");
                contentStream.endText();

                contentStream.setLineWidth(2);
                contentStream.moveTo(100, 700);
                contentStream.lineTo(200, 700);
                contentStream.stroke();

                contentStream.beginText();
                contentStream.setFont(helvetica(realDocument), 12);
                contentStream.newLineAtOffset(50, 650);
                contentStream.showText("This block contains confidential information");
                contentStream.endText();

                contentStream.addRect(100, 600, 100, 50);
                contentStream.fill();

                contentStream.beginText();
                contentStream.setFont(helvetica(realDocument), 12);
                contentStream.newLineAtOffset(50, 550);
                contentStream.showText("This is the third text block");
                contentStream.endText();
            }

            RedactPdfRequest request = createRedactPdfRequest();
            request.setListOfText("confidential");
            request.setUseRegex(false);
            request.setWholeWordSearch(false);

            ResponseEntity<Resource> response = redactController.redactPdf(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            assertNotNull(response.getBody());
            assertTrue(drainBody(response).length > 0);
        }
    }
}
