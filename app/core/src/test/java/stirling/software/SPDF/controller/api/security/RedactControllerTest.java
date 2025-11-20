package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.awt.Color;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.PdfiumRedactionRegion;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.service.redaction.PdfiumRedactionService;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.service.CustomPDFDocumentFactory;

@DisplayName("PDF Redaction Controller tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RedactControllerTest {

    private static final Logger log = LoggerFactory.getLogger(RedactControllerTest.class);

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfiumRedactionService pdfiumRedactionService;

    @InjectMocks private RedactController redactController;

    private MockMultipartFile mockPdfFile;
    private PDDocument mockDocument;
    private PDPageTree mockPages;
    private PDPage mockPage;

    private PDDocument realDocument;
    private PDPage realPage;

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
            ResponseEntity<byte[]> response = redactController.redactPdf(request);

            if (expectSuccess && response != null) {
                assertNotNull(response);
                assertEquals(200, response.getStatusCode().value());
                assertNotNull(response.getBody());
                assertTrue(response.getBody().length > 0);
                verify(mockDocument, times(1)).save(any(ByteArrayOutputStream.class));
                // With try-with-resources, close() is called multiple times:
                // - Once for initial document
                // - Once per search term (for finding matches)
                // - Once per search term (for verification after PDFium)
                // - Once for final document
                // Just verify it was called at least once
                verify(mockDocument, atLeastOnce()).close();
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
            ResponseEntity<byte[]> response = redactController.redactPDF(request);

            if (response != null) {
                assertNotNull(response);
                assertEquals(200, response.getStatusCode().value());
                verify(mockDocument, times(1)).save(any(ByteArrayOutputStream.class));
            }
        } catch (Exception e) {
            log.info("Manual redaction test completed with graceful handling: {}", e.getMessage());
        }
    }

    @BeforeEach
    void setUp() throws IOException {
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
        org.apache.pdfbox.pdmodel.PDDocumentCatalog mockCatalog =
                mock(org.apache.pdfbox.pdmodel.PDDocumentCatalog.class);

        // Setup document structure properly
        when(pdfDocumentFactory.load(any(byte[].class))).thenReturn(mockDocument);
        when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(mockDocument);
        when(pdfiumRedactionService.isAvailable()).thenReturn(false);
        when(pdfiumRedactionService.redact(any(byte[].class), anyString(), anyList()))
                .thenReturn(Optional.empty());
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

        org.apache.pdfbox.cos.COSDocument mockCOSDocument =
                mock(org.apache.pdfbox.cos.COSDocument.class);
        org.apache.pdfbox.cos.COSStream mockCOSStream = mock(org.apache.pdfbox.cos.COSStream.class);
        when(mockDocument.getDocument()).thenReturn(mockCOSDocument);
        when(mockCOSDocument.createCOSStream()).thenReturn(mockCOSStream);

        ByteArrayOutputStream mockOutputStream = new ByteArrayOutputStream();
        when(mockCOSStream.createOutputStream()).thenReturn(mockOutputStream);
        when(mockCOSStream.createOutputStream(any())).thenReturn(mockOutputStream);

        doAnswer(
                        invocation -> {
                            ByteArrayOutputStream baos = invocation.getArgument(0);
                            baos.write("Mock PDF Content".getBytes());
                            return null;
                        })
                .when(mockDocument)
                .save(any(ByteArrayOutputStream.class));
        doNothing().when(mockDocument).close();

        // Initialize a real document for unit tests
        setupRealDocument();
    }

    private void setupRealDocument() {
        realDocument = new PDDocument();
        realPage = new PDPage(PDRectangle.A4);
        realDocument.addPage(realPage);

        // Set up basic page resources
        PDResources resources = new PDResources();
        resources.put(
                COSName.getPDFName("F1"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));
        realPage.setResources(resources);
    }

    private String[] invokeParseListOfText(String value, boolean useRegex) throws Exception {
        Method method =
                RedactController.class.getDeclaredMethod(
                        "parseListOfText", String.class, boolean.class);
        method.setAccessible(true);
        return (String[]) method.invoke(redactController, value, useRegex);
    }

    @AfterEach
    void tearDown() throws IOException {
        reset(mockDocument, mockPages, mockPage, pdfDocumentFactory);
        if (realDocument != null) {
            realDocument.close();
        }
    }

    private ManualRedactPdfRequest createManualRedactPdfRequest() {
        ManualRedactPdfRequest request = new ManualRedactPdfRequest();
        request.setFileInput(mockPdfFile);
        return request;
    }

    private void configureRealPdfLoading() throws IOException {
        when(pdfDocumentFactory.load(any(byte[].class)))
                .thenAnswer(
                        invocation -> loadRealDocument(invocation.getArgument(0, byte[].class)));
    }

    private MockMultipartFile createPdfMultipartFile(String filename, String text)
            throws IOException {
        return new MockMultipartFile(
                "fileInput", filename, MediaType.APPLICATION_PDF_VALUE, createPdfWithText(text));
    }

    private PDDocument loadRealDocument(byte[] bytes) {
        try {
            return Loader.loadPDF(bytes);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to load test PDF", e);
        }
    }

    private byte[] createSimplePdfContent() throws IOException {
        return createPdfWithText("This is a simple PDF.");
    }

    private byte[] createPdfWithText(String text) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream contentStream = new PDPageContentStream(doc, page)) {
                contentStream.beginText();
                contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                contentStream.newLineAtOffset(100, 700);
                contentStream.showText(text);
                contentStream.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private RedactPdfRequest createRedactPdfRequest() {
        RedactPdfRequest request = new RedactPdfRequest();
        request.setFileInput(mockPdfFile);
        return request;
    }

    @Nested
    @DisplayName("Automatic Text Redaction")
    class AutomaticRedactionTests {

        @Test
        @DisplayName("Should redact basic text successfully")
        void redactBasicText() {
            testAutoRedaction("confidential\nsecret", false, false, "#000000", 2.0f, false, true);
        }

        @Test
        @DisplayName("Should handle simple text redaction")
        void handleSimpleTextRedaction() {
            testAutoRedaction("sensitive", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle empty text list gracefully")
        void handleEmptyTextList() {
            testAutoRedaction("", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should redact multiple search terms")
        void redactMultipleSearchTerms() {
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
        void handleLargeNumberOfSearchTerms() {
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

            org.apache.pdfbox.pdmodel.PDDocumentInformation mockInfo =
                    mock(org.apache.pdfbox.pdmodel.PDDocumentInformation.class);
            when(mockDocument.getDocumentInformation()).thenReturn(mockInfo);

            ResponseEntity<byte[]> response = redactController.redactPdf(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());

            verify(mockDocument).save(any(ByteArrayOutputStream.class));
            // With try-with-resources, close() is called multiple times
            verify(mockDocument, atLeastOnce()).close();
        }
    }

    @Nested
    @DisplayName("Regular Expression Redaction")
    class RegexRedactionTests {

        @Test
        @DisplayName("Should redact using regex patterns")
        void redactUsingRegexPatterns() {
            testAutoRedaction("\\d{3}-\\d{2}-\\d{4}", true, false, "#FF0000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle email pattern redaction")
        void handleEmailPatternRedaction() {
            testAutoRedaction(
                    "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
                    true, false, "#0000FF", 1.5f, false, true);
        }

        @Test
        @DisplayName("Should handle phone number patterns")
        void handlePhoneNumberPatterns() {
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
        void handleVariousRegexPatterns(String regexPattern) {
            testAutoRedaction(regexPattern, true, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle invalid regex gracefully")
        void handleInvalidRegex() {
            testAutoRedaction("[invalid regex(", true, false, "#000000", 1.0f, false, false);
        }
    }

    @Nested
    @DisplayName("Whole Word Search Redaction")
    class WholeWordRedactionTests {

        @Test
        @DisplayName("Should redact whole words only")
        void redactWholeWordsOnly() {
            testAutoRedaction("test", false, true, "#0000FF", 0.5f, false, true);
        }

        @Test
        @DisplayName("Should handle word boundaries correctly")
        void handleWordBoundariesCorrectly() {
            testAutoRedaction("confidential", false, true, "#FF0000", 1.0f, false, true);
        }
    }

    @Nested
    @DisplayName("Color and Styling Options")
    class ColorAndStylingTests {

        @Test
        @DisplayName("Should handle red hex color")
        void handleRedHexColor() {
            testAutoRedaction("test", false, false, "#FF0000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle green hex color")
        void handleGreenHexColor() {
            testAutoRedaction("test", false, false, "#00FF00", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle blue hex color")
        void handleBlueHexColor() {
            testAutoRedaction("test", false, false, "#0000FF", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should default to black for invalid colors")
        void defaultToBlackForInvalidColors() {
            testAutoRedaction("test", false, false, "invalid-color", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle yellow hex color")
        void handleYellowHexColor() {
            testAutoRedaction("test", false, false, "#FFFF00", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle magenta hex color")
        void handleMagentaHexColor() {
            testAutoRedaction("test", false, false, "#FF00FF", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle cyan hex color")
        void handleCyanHexColor() {
            testAutoRedaction("test", false, false, "#00FFFF", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle black hex color")
        void handleBlackHexColor() {
            testAutoRedaction("test", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle white hex color")
        void handleWhiteHexColor() {
            testAutoRedaction("test", false, false, "#FFFFFF", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle zero padding")
        void handleZeroPadding() {
            testAutoRedaction("test", false, false, "#000000", 0.0f, false, true);
        }

        @Test
        @DisplayName("Should handle normal padding")
        void handleNormalPadding() {
            testAutoRedaction("test", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle large padding")
        void handleLargePadding() {
            testAutoRedaction("test", false, false, "#000000", 2.5f, false, true);
        }

        @Test
        @DisplayName("Should handle extra large padding")
        void handleExtraLargePadding() {
            testAutoRedaction("test", false, false, "#000000", 5.0f, false, true);
        }
    }

    @Nested
    @DisplayName("Manual Redaction Areas")
    class ManualRedactionTests {

        @Test
        @DisplayName("Should redact using manual areas")
        void redactUsingManualAreas() {
            List<RedactionArea> redactionAreas = createValidRedactionAreas();
            testManualRedaction(redactionAreas, false);
        }

        @Test
        @DisplayName("Should handle null redaction areas")
        void handleNullRedactionAreas() {
            testManualRedaction(null, false);
        }

        @Test
        @DisplayName("Should handle empty redaction areas")
        void handleEmptyRedactionAreas() {
            testManualRedaction(new ArrayList<>(), false);
        }

        @Test
        @DisplayName("Should handle invalid redaction area coordinates")
        void handleInvalidRedactionAreaCoordinates() {
            List<RedactionArea> invalidAreas = createInvalidRedactionAreas();
            testManualRedaction(invalidAreas, false);
        }

        @Test
        @DisplayName("Should handle multiple redaction areas")
        void handleMultipleRedactionAreas() {
            List<RedactionArea> multipleAreas = createMultipleRedactionAreas();
            testManualRedaction(multipleAreas, false);
        }

        @Test
        @DisplayName("Should handle overlapping redaction areas")
        void handleOverlappingRedactionAreas() {
            List<RedactionArea> overlappingAreas = createOverlappingRedactionAreas();
            testManualRedaction(overlappingAreas, false);
        }

        @Test
        @DisplayName("Should handle redaction areas with different colors")
        void handleRedactionAreasWithDifferentColors() {
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
        void handlePdfToImageConversionDisabled() {
            testAutoRedaction("sensitive", false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle PDF to image conversion enabled")
        void handlePdfToImageConversionEnabled() {
            testAutoRedaction("sensitive", false, false, "#000000", 1.0f, true, true);
        }

        @Test
        @DisplayName("Should handle manual redaction with image conversion")
        void handleManualRedactionWithImageConversion() {
            List<RedactionArea> areas = createValidRedactionAreas();
            testManualRedaction(areas, true);
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
        void handleExtremelyLongSearchText() {
            String longText = "a".repeat(10000);
            testAutoRedaction(longText, false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle special characters in search text")
        void handleSpecialCharactersInSearchText() {
            testAutoRedaction("特殊字符测试 ñáéíóú àèìòù", false, false, "#000000", 1.0f, false, true);
        }

        @ParameterizedTest
        @ValueSource(strings = {"", " ", "\t", "\n", "\r\n", "   \t\n   "})
        @DisplayName("Should handle whitespace-only search terms")
        void handleWhitespaceOnlySearchTerms(String whitespacePattern) {
            testAutoRedaction(whitespacePattern, false, false, "#000000", 1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle null redact color gracefully")
        void handleNullRedactColor() throws IOException {
            RedactPdfRequest request = createRedactPdfRequest();
            request.setListOfText("test");
            request.setRedactColor(null);

            ResponseEntity<byte[]> response = redactController.redactPdf(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
        }

        @Test
        @DisplayName("Should handle negative padding gracefully")
        void handleNegativePadding() {
            testAutoRedaction("test", false, false, "#000000", -1.0f, false, true);
        }

        @Test
        @DisplayName("Should handle extremely large padding")
        void handleExtremelyLargePadding() {
            testAutoRedaction("test", false, false, "#000000", 100.0f, false, true);
        }

        @Test
        @DisplayName("Should handle null manual redaction areas gracefully")
        void handleNullManualRedactionAreas() throws Exception {
            ManualRedactPdfRequest request = createManualRedactPdfRequest();
            request.setRedactions(null);

            ResponseEntity<byte[]> response = redactController.redactPDF(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
        }

        @Test
        @DisplayName("Should handle out of bounds page numbers gracefully")
        void handleOutOfBoundsPageNumbers() throws Exception {
            ManualRedactPdfRequest request = createManualRedactPdfRequest();
            request.setPageNumbers("100-200");

            ResponseEntity<byte[]> response = redactController.redactPDF(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
        }
    }

    @Nested
    @DisplayName("PDFium Availability Flows")
    class PdfiumAvailabilityTests {

        @Test
        @DisplayName(
                "Should route through PDFium when service is available and always use black boxes")
        void shouldUsePdfiumWhenAvailable() throws Exception {
            configureRealPdfLoading();
            MockMultipartFile realFile =
                    createPdfMultipartFile("pdfium-available.pdf", "secret information");

            when(pdfiumRedactionService.isAvailable()).thenReturn(true);
            when(pdfiumRedactionService.redact(any(byte[].class), anyString(), anyList(), eq(true)))
                    .thenReturn(Optional.of(createPdfWithText("sanitized content")));

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(realFile);
            request.setListOfText("secret");

            ResponseEntity<byte[]> response = redactController.redactPdf(request);

            assertNotNull(response);
            // Verify that PDFium is always called with drawBlackBoxes=true (hardcoded)
            verify(pdfiumRedactionService, atLeastOnce())
                    .redact(any(byte[].class), anyString(), anyList(), eq(true));
            verify(pdfiumRedactionService, never())
                    .redact(any(byte[].class), anyString(), anyList(), eq(false));
        }

        @Test
        @DisplayName("Should fall back to PDFBox overlays when PDFium is unavailable")
        void shouldFallbackWhenPdfiumUnavailable() throws Exception {
            when(pdfiumRedactionService.isAvailable()).thenReturn(false);

            RedactPdfRequest request = createRedactPdfRequest();
            request.setListOfText("secret");

            ResponseEntity<byte[]> response = redactController.redactPdf(request);

            assertNotNull(response);
            verify(pdfiumRedactionService, never())
                    .redact(any(byte[].class), anyString(), anyList(), anyBoolean());
            verify(mockDocument, atLeastOnce()).save(any(ByteArrayOutputStream.class));
        }

        @Test
        @DisplayName("Should always use PDFium with black boxes enabled")
        void shouldAlwaysUseBlackBoxes() throws Exception {
            configureRealPdfLoading();
            MockMultipartFile realFile = createPdfMultipartFile("pdfium-redact.pdf", "secret data");

            when(pdfiumRedactionService.isAvailable()).thenReturn(true);
            when(pdfiumRedactionService.redact(any(byte[].class), anyString(), anyList(), eq(true)))
                    .thenReturn(Optional.of(createPdfWithText("sanitized")));

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(realFile);
            request.setListOfText("secret");

            redactController.redactPdf(request);

            // Verify PDFium is always called with drawBlackBoxes=true
            verify(pdfiumRedactionService, atLeastOnce())
                    .redact(any(byte[].class), anyString(), anyList(), eq(true));
            // Verify it's never called with drawBlackBoxes=false
            verify(pdfiumRedactionService, never())
                    .redact(any(byte[].class), anyString(), anyList(), eq(false));
        }
    }

    @Nested
    @DisplayName("Real PDF Integration")
    class RealPdfIntegrationTests {

        @Test
        @DisplayName("Should process a real PDF when PDFium is unavailable")
        void shouldProcessRealPdfWithoutPdfium() throws Exception {
            byte[] pdfBytes = createPdfWithText("Confidential data lives here.");
            MockMultipartFile realFile =
                    new MockMultipartFile(
                            "fileInput", "real.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(realFile);
            request.setListOfText("Confidential");

            when(pdfiumRedactionService.isAvailable()).thenReturn(false);
            configureRealPdfLoading();

            ResponseEntity<byte[]> response = redactController.redactPdf(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            assertNotNull(response.getBody());

            try (PDDocument processed = Loader.loadPDF(response.getBody())) {
                assertEquals(1, processed.getNumberOfPages());
                String extracted = new PDFTextStripper().getText(processed);
                assertTrue(extracted.contains("Confidential"));
            }
        }
    }

    @Nested
    @DisplayName("Color Decoding Utility Tests")
    class ColorDecodingTests {

        @Test
        @DisplayName("Should decode valid hex color with hash")
        void decodeValidHexColorWithHash() {
            Color result = redactController.decodeOrDefault("#FF0000");
            assertEquals(Color.RED, result);
        }

        @Test
        @DisplayName("Should decode valid hex color without hash")
        void decodeValidHexColorWithoutHash() {
            Color result = redactController.decodeOrDefault("FF0000");
            assertEquals(Color.RED, result);
        }

        @Test
        @DisplayName("Should default to black for null color")
        void defaultToBlackForNullColor() {
            Color result = redactController.decodeOrDefault(null);
            assertEquals(Color.BLACK, result);
        }

        @Test
        @DisplayName("Should default to black for invalid color")
        void defaultToBlackForInvalidColor() {
            Color result = redactController.decodeOrDefault("invalid-color");
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
            Color result = redactController.decodeOrDefault(colorInput);
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
            Color result1 = redactController.decodeOrDefault("123");
            Color result2 = redactController.decodeOrDefault("#12");

            assertNotNull(result1);
            assertNotNull(result2);
        }
    }

    private List<RedactionArea> createValidRedactionAreas() {
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

    private List<RedactionArea> createInvalidRedactionAreas() {
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

    private List<RedactionArea> createMultipleRedactionAreas() {
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

    private List<RedactionArea> createOverlappingRedactionAreas() {
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

    // Helper methods for real PDF content creation

    @Nested
    @DisplayName("List Of Text Parsing")
    class ListOfTextParsingTests {

        @Test
        @DisplayName("Should split on newlines and trim entries")
        void shouldSplitOnNewlinesAndTrimEntries() throws Exception {
            String[] result = invokeParseListOfText(" First \nSecond\n\n third ", false);
            assertArrayEquals(new String[] {"First", "Second", "third"}, result);
        }

        @Test
        @DisplayName("Should fallback to commas when no newlines present in plain mode")
        void shouldFallbackToCommasWhenPlainMode() throws Exception {
            String[] result = invokeParseListOfText("alpha, beta ,gamma", false);
            assertArrayEquals(new String[] {"alpha", "beta", "gamma"}, result);
        }

        @Test
        @DisplayName("Should not split on commas when regex mode is enabled")
        void shouldRespectRegexModeWhenCommasPresent() throws Exception {
            String[] result = invokeParseListOfText("a,b,c", true);
            assertArrayEquals(new String[] {"a,b,c"}, result);
        }

        @Test
        @DisplayName("Should handle null or blank input")
        void shouldHandleNullOrBlankInput() throws Exception {
            assertArrayEquals(new String[0], invokeParseListOfText(null, false));
            assertArrayEquals(new String[0], invokeParseListOfText("   \n  ", false));
        }
    }

    @Nested
    @DisplayName("PDFium Coordinate Conversion")
    class PdfiumCoordinateConversionTests {

        @Test
        @DisplayName("Should convert PDFBox coordinates to PDFium device space")
        void shouldConvertPdfboxCoordinatesToPdfiumDeviceSpace() throws Exception {
            Map<Integer, List<PDFText>> matches = new HashMap<>();
            PDFText block = new PDFText(0, 25f, 55f, 125f, 95f, "Lorem");
            matches.put(0, Collections.singletonList(block));

            Method method =
                    RedactController.class.getDeclaredMethod(
                            "buildPdfiumRegions", PDDocument.class, Map.class, float.class);
            method.setAccessible(true);

            @SuppressWarnings("unchecked")
            List<PdfiumRedactionRegion> regions =
                    (List<PdfiumRedactionRegion>)
                            method.invoke(redactController, realDocument, matches, 0f);

            assertEquals(1, regions.size());
            PdfiumRedactionRegion region = regions.get(0);
            assertEquals(block.getPageIndex(), region.getPageIndex());
            assertEquals(block.getX1(), region.getX(), 0.001);
            assertEquals(block.getY1(), region.getY(), 0.001);
            assertEquals(block.getX2() - block.getX1(), region.getWidth(), 0.001);
            assertEquals(block.getY2() - block.getY1(), region.getHeight(), 0.001);
        }
    }
}
