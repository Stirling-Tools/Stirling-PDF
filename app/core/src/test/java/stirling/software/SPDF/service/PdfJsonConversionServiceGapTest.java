package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.exception.CacheUnavailableException;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.service.pdfjson.PdfJsonFontService;
import stirling.software.SPDF.service.pdfjson.type3.Type3FontConversionService;
import stirling.software.SPDF.service.pdfjson.type3.Type3GlyphExtractor;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.TaskManager;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Gap tests for {@link PdfJsonConversionService} that exercise the public conversion entrypoints
 * and the cache-backed public API. These complement {@code
 * PdfJsonConversionServiceUnicodeParsingTest} (which covers the static {@code
 * parseToUnicodeCodepoint} / {@code countCodesProtected} helpers) without duplicating those cases.
 *
 * <p>The service is constructed as a plain unit (no Spring context), so {@code @PostConstruct}
 * never runs: font normalization stays disabled and Ghostscript is never invoked, keeping every
 * test fully deterministic and free of external processes. {@link CustomPDFDocumentFactory#load} is
 * stubbed to return real in-memory PDFBox documents, and {@code fallbackFontService} is mocked so
 * the JSON to PDF path can resolve its mandatory fallback font without touching the classpath.
 */
@ExtendWith(MockitoExtension.class)
@org.mockito.junit.jupiter.MockitoSettings(strictness = Strictness.LENIENT)
class PdfJsonConversionServiceGapTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;
    @Mock private TaskManager taskManager;
    @Mock private PdfJsonFallbackFontService fallbackFontService;
    @Mock private PdfJsonFontService fontService;
    @Mock private Type3FontConversionService type3FontConversionService;
    @Mock private Type3GlyphExtractor type3GlyphExtractor;
    @Mock private ApplicationProperties applicationProperties;

    // Real collaborators: COS (de)serialization is complex and pure, so we use the real component.
    private final PdfJsonCosMapper cosMapper = new PdfJsonCosMapper();

    // Mirror production: application.properties sets
    // spring.jackson.deserialization.fail-on-null-for-primitives=false, so the Spring-managed
    // mapper
    // maps null/absent JSON values onto Java primitive defaults (e.g. the boolean lazyImages
    // field).
    // A naive JsonMapper.builder().build() keeps the Jackson 3 default (true) and would throw
    // MismatchedInputException on round-trip, which is a test-mapper config gap, not a product bug.
    private final ObjectMapper objectMapper =
            JsonMapper.builder()
                    .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
                    .build();

    private PdfJsonConversionService service;

    private final List<Path> createdTempFiles = new ArrayList<>();

    @BeforeEach
    void setUp() throws IOException {
        service =
                new PdfJsonConversionService(
                        pdfDocumentFactory,
                        objectMapper,
                        endpointConfiguration,
                        tempFileManager,
                        taskManager,
                        cosMapper,
                        fallbackFontService,
                        fontService,
                        type3FontConversionService,
                        type3GlyphExtractor,
                        applicationProperties);

        // The TempFile wrapper delegates straight to the manager; back it with real temp files so
        // convertPdfToJson can transferTo() and size/read the working path.
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            String suffix = invocation.getArgument(0);
                            Path path = Files.createTempFile("pdfjson-gap-test", suffix);
                            createdTempFiles.add(path);
                            return path.toFile();
                        });
        when(tempFileManager.deleteTempFile(any(File.class)))
                .thenAnswer(
                        invocation -> {
                            File file = invocation.getArgument(0);
                            return file != null && file.delete();
                        });
    }

    @AfterEach
    void tearDown() throws IOException {
        for (Path path : createdTempFiles) {
            Files.deleteIfExists(path);
        }
        createdTempFiles.clear();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /** Builds a tiny in-memory PDF with the requested page dimensions and rotations. */
    private PDDocument newPdf(float[][] sizes, int[] rotations) {
        PDDocument document = new PDDocument();
        for (int i = 0; i < sizes.length; i++) {
            PDPage page = new PDPage(new PDRectangle(sizes[i][0], sizes[i][1]));
            if (rotations != null) {
                page.setRotation(rotations[i]);
            }
            document.addPage(page);
        }
        return document;
    }

    private PDDocument singlePagePdf(float width, float height) {
        return newPdf(new float[][] {{width, height}}, null);
    }

    /** Stubs the fallback font service so buildFontMap can always resolve a usable PDFont. */
    private void stubFallbackFont() throws IOException {
        when(fallbackFontService.buildFallbackFontModel())
                .thenAnswer(
                        invocation ->
                                PdfJsonFont.builder()
                                        .id(PdfJsonFallbackFontService.FALLBACK_FONT_ID)
                                        .uid(PdfJsonFallbackFontService.FALLBACK_FONT_ID)
                                        .baseName("Fallback")
                                        .subtype("TrueType")
                                        .build());
        when(fallbackFontService.loadFallbackPdfFont(any(PDDocument.class)))
                .thenAnswer(invocation -> new PDType1Font(Standard14Fonts.FontName.HELVETICA));
    }

    private MockMultipartFile pdfMultipart() {
        return new MockMultipartFile(
                "fileInput", "input.pdf", "application/pdf", "%PDF-1.4 placeholder".getBytes());
    }

    private byte[] runJsonToPdf(PdfJsonDocument doc) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertJsonToPdf(doc, out);
        return out.toByteArray();
    }

    // ------------------------------------------------------------------
    // parseToUnicodeCodepoint - extra cases not covered by the unicode test
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("parseToUnicodeCodepoint extras")
    class ParseToUnicodeExtras {

        @Test
        @DisplayName("parses the maximum BMP value FFFF")
        void parsesMaxBmpValue() {
            assertEquals(0xFFFF, PdfJsonConversionService.parseToUnicodeCodepoint("FFFF"));
        }

        @Test
        @DisplayName("accepts lowercase hex digits")
        void parsesLowercaseHex() {
            // U+00E9 LATIN SMALL LETTER E WITH ACUTE.
            assertEquals(0x00E9, PdfJsonConversionService.parseToUnicodeCodepoint("00e9"));
        }

        @Test
        @DisplayName("parses a 3-char value directly (length <= 4)")
        void parsesThreeCharValue() {
            assertEquals(0x1F4, PdfJsonConversionService.parseToUnicodeCodepoint("1f4"));
        }
    }

    // ------------------------------------------------------------------
    // convertJsonToPdf(PdfJsonDocument, OutputStream)
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("convertJsonToPdf(document)")
    class JsonToPdfDocument {

        @Test
        @DisplayName("null document throws IllegalArgumentException")
        void nullDocumentThrows() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.convertJsonToPdf((PdfJsonDocument) null, out));
        }

        @Test
        @DisplayName("single empty page produces a valid one-page PDF with correct dimensions")
        void singleEmptyPage() throws IOException {
            stubFallbackFont();
            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(1);
            page.setWidth(300f);
            page.setHeight(400f);

            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setPages(List.of(page));

            byte[] pdfBytes = runJsonToPdf(doc);
            assertTrue(pdfBytes.length > 0, "expected non-empty PDF output");

            try (PDDocument loaded = Loader.loadPDF(pdfBytes)) {
                assertEquals(1, loaded.getNumberOfPages());
                PDRectangle box = loaded.getPage(0).getMediaBox();
                assertEquals(300f, box.getWidth(), 0.01f);
                assertEquals(400f, box.getHeight(), 0.01f);
            }
        }

        @Test
        @DisplayName("missing width/height falls back to US-Letter defaults")
        void missingDimensionsUseDefaults() throws IOException {
            stubFallbackFont();
            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(1);
            // width/height left null -> safeFloat defaults of 612x792

            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setPages(List.of(page));

            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                PDRectangle box = loaded.getPage(0).getMediaBox();
                assertEquals(612f, box.getWidth(), 0.01f);
                assertEquals(792f, box.getHeight(), 0.01f);
            }
        }

        @Test
        @DisplayName("multiple pages keep their individual sizes and rotation")
        void multiplePagesKeepSizesAndRotation() throws IOException {
            stubFallbackFont();
            PdfJsonPage first = new PdfJsonPage();
            first.setPageNumber(1);
            first.setWidth(200f);
            first.setHeight(300f);
            first.setRotation(90);

            PdfJsonPage second = new PdfJsonPage();
            second.setPageNumber(2);
            second.setWidth(500f);
            second.setHeight(250f);
            second.setRotation(180);

            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setPages(List.of(first, second));

            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                assertEquals(2, loaded.getNumberOfPages());
                assertEquals(200f, loaded.getPage(0).getMediaBox().getWidth(), 0.01f);
                assertEquals(90, loaded.getPage(0).getRotation());
                assertEquals(500f, loaded.getPage(1).getMediaBox().getWidth(), 0.01f);
                assertEquals(180, loaded.getPage(1).getRotation());
            }
        }

        @Test
        @DisplayName("document metadata round-trips into PDDocumentInformation")
        void metadataRoundTrips() throws IOException {
            stubFallbackFont();
            PdfJsonMetadata metadata = new PdfJsonMetadata();
            metadata.setTitle("Gap Test Title");
            metadata.setAuthor("Gap Author");
            metadata.setSubject("Subject X");
            metadata.setKeywords("alpha,beta");
            metadata.setCreator("Creator App");
            metadata.setProducer("Producer Lib");
            metadata.setCreationDate("2020-06-15T12:00:00Z");

            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(1);
            page.setWidth(300f);
            page.setHeight(300f);

            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(metadata);
            doc.setPages(List.of(page));

            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                PDDocumentInformation info = loaded.getDocumentInformation();
                assertEquals("Gap Test Title", info.getTitle());
                assertEquals("Gap Author", info.getAuthor());
                assertEquals("Subject X", info.getSubject());
                assertEquals("alpha,beta", info.getKeywords());
                assertEquals("Creator App", info.getCreator());
                assertEquals("Producer Lib", info.getProducer());
                assertNotNull(info.getCreationDate(), "creation date should be applied");
            }
        }

        @Test
        @DisplayName("invalid creation date string is ignored without failing the conversion")
        void invalidCreationDateIgnored() throws IOException {
            stubFallbackFont();
            PdfJsonMetadata metadata = new PdfJsonMetadata();
            metadata.setTitle("Has bad date");
            metadata.setCreationDate("not-a-real-instant");

            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(1);
            page.setWidth(300f);
            page.setHeight(300f);

            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(metadata);
            doc.setPages(List.of(page));

            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                assertEquals("Has bad date", loaded.getDocumentInformation().getTitle());
            }
        }

        @Test
        @DisplayName("base64 XMP packet is restored onto the document catalog")
        void xmpMetadataApplied() throws IOException {
            stubFallbackFont();
            String xmpXml =
                    "<?xpacket begin=\"\"?><x:xmpmeta xmlns:x=\"adobe:ns:meta/\"></x:xmpmeta>";
            String base64 =
                    Base64.getEncoder().encodeToString(xmpXml.getBytes(StandardCharsets.UTF_8));

            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(1);
            page.setWidth(300f);
            page.setHeight(300f);

            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setXmpMetadata(base64);
            doc.setPages(List.of(page));

            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                assertNotNull(
                        loaded.getDocumentCatalog().getMetadata(),
                        "XMP metadata stream should be present on the catalog");
            }
        }

        @Test
        @DisplayName("null fonts list is initialised instead of causing an NPE")
        void nullFontsListHandled() throws IOException {
            stubFallbackFont();
            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(1);
            page.setWidth(300f);
            page.setHeight(300f);

            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setFonts(null);
            doc.setPages(List.of(page));

            byte[] pdfBytes = runJsonToPdf(doc);
            assertTrue(pdfBytes.length > 0);
            // buildFontMap mutates the (now non-null) list by appending the fallback model.
            assertNotNull(doc.getFonts());
            assertTrue(
                    doc.getFonts().stream()
                            .anyMatch(
                                    f ->
                                            PdfJsonFallbackFontService.FALLBACK_FONT_ID.equals(
                                                    f.getId())));
        }
    }

    // ------------------------------------------------------------------
    // convertJsonToPdf(MultipartFile, OutputStream)
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("convertJsonToPdf(file)")
    class JsonToPdfFile {

        @Test
        @DisplayName("null file throws IllegalArgumentException")
        void nullFileThrows() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.convertJsonToPdf((MockMultipartFile) null, out));
        }

        @Test
        @DisplayName("valid JSON payload is deserialized and rebuilt into a PDF")
        void validJsonProducesPdf() throws IOException {
            stubFallbackFont();
            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(1);
            page.setWidth(321f);
            page.setHeight(123f);
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setPages(List.of(page));

            byte[] json = objectMapper.writeValueAsBytes(doc);
            MockMultipartFile file =
                    new MockMultipartFile("fileInput", "doc.json", "application/json", json);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.convertJsonToPdf(file, out);

            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(1, loaded.getNumberOfPages());
                assertEquals(321f, loaded.getPage(0).getMediaBox().getWidth(), 0.01f);
            }
        }
    }

    // ------------------------------------------------------------------
    // convertPdfToJson family
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("convertPdfToJson")
    class PdfToJson {

        @Test
        @DisplayName("null file throws IllegalArgumentException")
        void nullFileThrows() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(IllegalArgumentException.class, () -> service.convertPdfToJson(null, out));
        }

        @Test
        @DisplayName("blank single-page PDF yields JSON with one page and matching dimensions")
        void blankSinglePage() throws IOException {
            try (PDDocument pdf = singlePagePdf(250f, 350f)) {
                when(pdfDocumentFactory.load(any(Path.class), eq(true))).thenReturn(pdf);

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                service.convertPdfToJson(pdfMultipart(), out);

                PdfJsonDocument result =
                        objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
                assertEquals(1, result.getPages().size());
                PdfJsonPage page = result.getPages().get(0);
                assertEquals(1, page.getPageNumber());
                assertEquals(250f, page.getWidth(), 0.01f);
                assertEquals(350f, page.getHeight(), 0.01f);
                assertNotNull(result.getMetadata());
                assertEquals(1, result.getMetadata().getNumberOfPages());
            }
        }

        @Test
        @DisplayName("multi-page PDF preserves per-page dimensions in the JSON model")
        void multiPageDimensions() throws IOException {
            try (PDDocument pdf =
                    newPdf(new float[][] {{200f, 300f}, {612f, 792f}}, new int[] {0, 90})) {
                when(pdfDocumentFactory.load(any(Path.class), eq(true))).thenReturn(pdf);

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                service.convertPdfToJson(pdfMultipart(), out);

                PdfJsonDocument result =
                        objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
                assertEquals(2, result.getPages().size());
                assertEquals(200f, result.getPages().get(0).getWidth(), 0.01f);
                assertEquals(792f, result.getPages().get(1).getHeight(), 0.01f);
                assertEquals(90, result.getPages().get(1).getRotation());
            }
        }

        @Test
        @DisplayName("source document metadata is extracted into the JSON metadata block")
        void extractsSourceMetadata() throws IOException {
            try (PDDocument pdf = singlePagePdf(300f, 300f)) {
                PDDocumentInformation info = pdf.getDocumentInformation();
                info.setTitle("Original Title");
                info.setAuthor("Original Author");
                when(pdfDocumentFactory.load(any(Path.class), eq(true))).thenReturn(pdf);

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                service.convertPdfToJson(pdfMultipart(), out);

                PdfJsonDocument result =
                        objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
                assertEquals("Original Title", result.getMetadata().getTitle());
                assertEquals("Original Author", result.getMetadata().getAuthor());
            }
        }

        @Test
        @DisplayName("lightweight overload still produces a parseable JSON document")
        void lightweightOverload() throws IOException {
            try (PDDocument pdf = singlePagePdf(300f, 300f)) {
                when(pdfDocumentFactory.load(any(Path.class), eq(true))).thenReturn(pdf);

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                service.convertPdfToJson(pdfMultipart(), true, out);

                PdfJsonDocument result =
                        objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
                assertEquals(1, result.getPages().size());
            }
        }

        @Test
        @DisplayName("progress callback receives a terminal complete event")
        void progressCallbackInvoked() throws IOException {
            try (PDDocument pdf = singlePagePdf(300f, 300f)) {
                when(pdfDocumentFactory.load(any(Path.class), eq(true))).thenReturn(pdf);

                AtomicBoolean sawComplete = new AtomicBoolean(false);
                AtomicBoolean sawAny = new AtomicBoolean(false);

                ByteArrayOutputStream out = new ByteArrayOutputStream();
                service.convertPdfToJson(
                        pdfMultipart(),
                        progress -> {
                            sawAny.set(true);
                            if (progress.getPercent() == 100 || progress.isComplete()) {
                                sawComplete.set(true);
                            }
                        },
                        out);

                assertTrue(sawAny.get(), "expected at least one progress event");
                assertTrue(sawComplete.get(), "expected a terminal 100%/complete progress event");
            }
        }

        @Test
        @DisplayName("convertPdfToJsonDocument returns an in-memory model")
        void convertPdfToJsonDocumentReturnsModel() throws IOException {
            try (PDDocument pdf = singlePagePdf(400f, 500f)) {
                when(pdfDocumentFactory.load(any(Path.class), eq(true))).thenReturn(pdf);

                PdfJsonDocument result = service.convertPdfToJsonDocument(pdfMultipart());

                assertNotNull(result);
                assertEquals(1, result.getPages().size());
                assertEquals(400f, result.getPages().get(0).getWidth(), 0.01f);
            }
        }
    }

    // ------------------------------------------------------------------
    // Cache-backed public API error branches (no PDF load required)
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("cache-backed API")
    class CacheApi {

        @Test
        @DisplayName("extractSinglePage with unknown jobId throws CacheUnavailableException")
        void extractSinglePageUnknownJob() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    CacheUnavailableException.class,
                    () -> service.extractSinglePage("missing-job", 1, out));
        }

        @Test
        @DisplayName("extractPageFonts with unknown jobId throws CacheUnavailableException")
        void extractPageFontsUnknownJob() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    CacheUnavailableException.class,
                    () -> service.extractPageFonts("missing-job", 1, out));
        }

        @Test
        @DisplayName("exportUpdatedPages requires a non-null jobId")
        void exportUpdatedPagesNullJob() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.exportUpdatedPages(null, new PdfJsonDocument(), out));
        }

        @Test
        @DisplayName("exportUpdatedPages rejects a blank jobId")
        void exportUpdatedPagesBlankJob() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.exportUpdatedPages("   ", new PdfJsonDocument(), out));
        }

        @Test
        @DisplayName("exportUpdatedPages with unknown jobId throws CacheUnavailableException")
        void exportUpdatedPagesUnknownJob() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    CacheUnavailableException.class,
                    () -> service.exportUpdatedPages("missing-job", new PdfJsonDocument(), out));
        }

        @Test
        @DisplayName("extractDocumentMetadata with null file throws IllegalArgumentException")
        void extractDocumentMetadataNullFile() {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.extractDocumentMetadata(null, "job", out));
        }

        @Test
        @DisplayName("clearCachedDocument on an unknown jobId is a no-op")
        void clearCachedDocumentUnknownJob() {
            assertDoesNotThrow(() -> service.clearCachedDocument("missing-job"));
        }
    }
}
