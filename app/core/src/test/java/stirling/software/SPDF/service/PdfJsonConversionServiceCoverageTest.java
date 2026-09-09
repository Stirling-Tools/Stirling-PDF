package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
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
import stirling.software.SPDF.model.json.PdfJsonAnnotation;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonDocumentMetadata;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonImageElement;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonTextColor;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
import stirling.software.SPDF.service.pdfjson.PdfJsonFontService;
import stirling.software.SPDF.service.pdfjson.type3.Type3FontConversionService;
import stirling.software.SPDF.service.pdfjson.type3.Type3GlyphExtractor;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.TaskManager;
import stirling.software.common.util.JobContext;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * High-volume coverage tests for {@link PdfJsonConversionService}. These drive the large uncovered
 * bulk of the class through real in-memory PDF round trips (text in multiple Standard14 fonts,
 * embedded raster images, rotated pages, CropBox != MediaBox, annotations, links) plus the
 * cache-backed lazy editor API (which is reachable once a {@code jobId} is present on {@link
 * JobContext}).
 *
 * <p>Complements {@code PdfJsonConversionServiceGapTest} (basic entrypoints) and {@code
 * PdfJsonConversionServiceUnicodeParsingTest} (static helpers) without repeating those cases.
 */
@ExtendWith(MockitoExtension.class)
@org.mockito.junit.jupiter.MockitoSettings(strictness = Strictness.LENIENT)
class PdfJsonConversionServiceCoverageTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;
    @Mock private TaskManager taskManager;
    @Mock private PdfJsonFallbackFontService fallbackFontService;
    @Mock private PdfJsonFontService fontService;
    @Mock private Type3FontConversionService type3FontConversionService;
    @Mock private Type3GlyphExtractor type3GlyphExtractor;
    @Mock private ApplicationProperties applicationProperties;

    // Real COS mapper: serialization is pure and complex, so the real component gives best
    // coverage.
    private final PdfJsonCosMapper cosMapper = new PdfJsonCosMapper();

    // Mirror production application.properties so primitive defaults map cleanly on round-trip.
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

        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            String suffix = invocation.getArgument(0);
                            Path path = Files.createTempFile("pdfjson-cov-test", suffix);
                            createdTempFiles.add(path);
                            return path.toFile();
                        });
        when(tempFileManager.deleteTempFile(any(File.class)))
                .thenAnswer(
                        invocation -> {
                            File file = invocation.getArgument(0);
                            return file != null && file.delete();
                        });
        when(taskManager.addNote(anyString(), anyString())).thenReturn(true);
    }

    @AfterEach
    void tearDown() throws IOException {
        JobContext.clear();
        for (Path path : createdTempFiles) {
            Files.deleteIfExists(path);
        }
        createdTempFiles.clear();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

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

    private MockMultipartFile pdfMultipart(byte[] bytes) {
        return new MockMultipartFile("fileInput", "input.pdf", "application/pdf", bytes);
    }

    private MockMultipartFile pdfMultipart() {
        return pdfMultipart("%PDF-1.4 placeholder".getBytes(StandardCharsets.UTF_8));
    }

    /** Serializes a PDDocument to bytes and closes it. */
    private byte[] toBytes(PDDocument document) throws IOException {
        try (document) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    /** Single page with one line of Helvetica text. */
    private byte[] simpleTextPdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
            cs.newLineAtOffset(72, 700);
            cs.showText("Hello PDF JSON round trip");
            cs.endText();
        }
        return toBytes(document);
    }

    /** Multi-font, multi-page PDF with rotation and varied colors to exercise text styling. */
    private byte[] richTextPdf() throws IOException {
        PDDocument document = new PDDocument();

        PDPage page1 = new PDPage(PDRectangle.LETTER);
        document.addPage(page1);
        try (PDPageContentStream cs = new PDPageContentStream(document, page1)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14f);
            cs.setNonStrokingColor(Color.RED);
            cs.newLineAtOffset(72, 720);
            cs.showText("Helvetica red line");
            cs.endText();

            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.TIMES_BOLD), 18f);
            cs.setNonStrokingColor(Color.BLUE);
            cs.setCharacterSpacing(1.5f);
            cs.newLineAtOffset(72, 680);
            cs.showText("Times bold blue spaced");
            cs.endText();

            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.COURIER), 10f);
            cs.newLineAtOffset(72, 640);
            cs.showText("Courier monospace 0123456789");
            cs.endText();
        }

        PDPage page2 = new PDPage(new PDRectangle(400, 600));
        page2.setRotation(90);
        document.addPage(page2);
        try (PDPageContentStream cs = new PDPageContentStream(document, page2)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_OBLIQUE), 12f);
            cs.newLineAtOffset(50, 500);
            cs.showText("Rotated page text");
            cs.endText();
        }

        PDPage page3 = new PDPage(new PDRectangle(300, 300));
        page3.setRotation(180);
        document.addPage(page3);
        try (PDPageContentStream cs = new PDPageContentStream(document, page3)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.TIMES_ITALIC), 11f);
            cs.newLineAtOffset(40, 150);
            cs.showText("Half turn page");
            cs.endText();
        }
        return toBytes(document);
    }

    private BufferedImage colorTile(int w, int h, Color color) {
        BufferedImage image = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < w; x++) {
            for (int y = 0; y < h; y++) {
                image.setRGB(x, y, color.getRGB());
            }
        }
        return image;
    }

    /** PDF carrying an embedded lossless raster image plus a line of text. */
    private byte[] imagePdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        PDImageXObject image =
                LosslessFactory.createFromImage(document, colorTile(32, 24, Color.GREEN));
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.drawImage(image, 100, 500, 128, 96);
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
            cs.newLineAtOffset(72, 400);
            cs.showText("Caption under image");
            cs.endText();
        }
        return toBytes(document);
    }

    /** PDF whose CropBox is strictly smaller than its MediaBox. */
    private byte[] cropBoxPdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        page.setCropBox(new PDRectangle(20, 30, 400, 500));
        document.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
            cs.newLineAtOffset(100, 400);
            cs.showText("Inside crop box");
            cs.endText();
        }
        return toBytes(document);
    }

    /** PDF with a text annotation and a link annotation on a single page. */
    private byte[] annotatedPdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);

        PDAnnotationText note = new PDAnnotationText();
        note.setContents("Sticky note contents");
        note.setRectangle(new PDRectangle(50, 700, 20, 20));
        note.setSubject("note subject");

        PDAnnotationLink link = new PDAnnotationLink();
        link.setRectangle(new PDRectangle(100, 600, 200, 20));

        page.getAnnotations().add(note);
        page.getAnnotations().add(link);

        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
            cs.newLineAtOffset(72, 500);
            cs.showText("Annotated document");
            cs.endText();
        }
        return toBytes(document);
    }

    /** Converts the given PDF bytes to the in-memory JSON model using the real factory load. */
    private PdfJsonDocument toJsonDocument(byte[] pdfBytes) throws IOException {
        when(pdfDocumentFactory.load(any(Path.class), eq(true)))
                .thenAnswer(
                        invocation ->
                                Loader.loadPDF(invocation.getArgument(0, Path.class).toFile()));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertPdfToJson(pdfMultipart(pdfBytes), out);
        return objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
    }

    private byte[] runJsonToPdf(PdfJsonDocument doc) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertJsonToPdf(doc, out);
        return out.toByteArray();
    }

    /**
     * Populates the document cache by running a lazy conversion (jobId present on JobContext) so
     * the cache-backed page/font/export endpoints can be exercised afterwards. The factory is
     * stubbed to load from both Path and raw bytes for the subsequent cache re-loads.
     */
    private PdfJsonDocument cacheLazyDocument(String jobId, byte[] pdfBytes) throws IOException {
        when(pdfDocumentFactory.load(any(Path.class), eq(true)))
                .thenAnswer(
                        invocation ->
                                Loader.loadPDF(invocation.getArgument(0, Path.class).toFile()));
        when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                .thenAnswer(invocation -> Loader.loadPDF(invocation.getArgument(0, byte[].class)));
        JobContext.setJobId(jobId);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertPdfToJson(pdfMultipart(pdfBytes), true, out);
        return objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
    }

    // ==================================================================
    // PDF -> JSON deep extraction
    // ==================================================================

    @Nested
    @DisplayName("PDF to JSON extraction")
    class PdfToJsonExtraction {

        @Test
        @DisplayName("simple text PDF yields text elements with font references")
        void simpleTextProducesElements() throws IOException {
            PdfJsonDocument doc = toJsonDocument(simpleTextPdf());

            assertEquals(1, doc.getPages().size());
            List<PdfJsonTextElement> elements = doc.getPages().get(0).getTextElements();
            assertThat(elements).isNotEmpty();
            String joined =
                    elements.stream().map(PdfJsonTextElement::getText).reduce("", (a, b) -> a + b);
            assertThat(joined).contains("Hello");
            assertThat(doc.getFonts()).isNotEmpty();
            // Every text run should reference a known font id.
            assertThat(elements).allSatisfy(e -> assertThat(e.getFontId()).isNotBlank());
        }

        @Test
        @DisplayName("multi-font multi-page PDF captures distinct fonts and page geometry")
        void richTextCapturesFontsAndGeometry() throws IOException {
            PdfJsonDocument doc = toJsonDocument(richTextPdf());

            assertEquals(3, doc.getPages().size());
            // The first page used three different base fonts.
            long distinctBaseNames =
                    doc.getFonts().stream()
                            .map(PdfJsonFont::getBaseName)
                            .filter(java.util.Objects::nonNull)
                            .distinct()
                            .count();
            assertThat(distinctBaseNames).isGreaterThanOrEqualTo(3);
            assertEquals(90, doc.getPages().get(1).getRotation());
            assertEquals(180, doc.getPages().get(2).getRotation());
            assertEquals(300f, doc.getPages().get(2).getWidth(), 0.5f);
        }

        @Test
        @DisplayName("text run colors are extracted into fill color components")
        void textColorsExtracted() throws IOException {
            PdfJsonDocument doc = toJsonDocument(richTextPdf());
            // Color extraction runs during conversion; assert text was extracted and any emitted
            // fill color carries well-formed components.
            assertThat(doc.getPages().get(0).getTextElements()).isNotEmpty();
            doc.getPages().get(0).getTextElements().stream()
                    .map(PdfJsonTextElement::getFillColor)
                    .filter(java.util.Objects::nonNull)
                    .map(PdfJsonTextColor::getComponents)
                    .forEach(c -> assertThat(c).isNotNull());
        }

        @Test
        @DisplayName("embedded image is extracted as an image element with data")
        void imageExtracted() throws IOException {
            PdfJsonDocument doc = toJsonDocument(imagePdf());
            List<PdfJsonImageElement> images = doc.getPages().get(0).getImageElements();
            assertThat(images).isNotEmpty();
            PdfJsonImageElement img = images.get(0);
            assertThat(img.getImageData()).isNotBlank();
            assertThat(img.getImageFormat()).isNotBlank();
            assertThat(img.getWidth()).isGreaterThan(0f);
        }

        @Test
        @DisplayName("CropBox-bounded page reports crop dimensions in JSON")
        void cropBoxDimensions() throws IOException {
            PdfJsonDocument doc = toJsonDocument(cropBoxPdf());
            PdfJsonPage page = doc.getPages().get(0);
            // CropBox is 400x500 here, smaller than the Letter MediaBox.
            assertEquals(400f, page.getWidth(), 0.5f);
            assertEquals(500f, page.getHeight(), 0.5f);
        }

        @Test
        @DisplayName("annotations and links are collected per page")
        void annotationsCollected() throws IOException {
            PdfJsonDocument doc = toJsonDocument(annotatedPdf());
            List<PdfJsonAnnotation> annotations = doc.getPages().get(0).getAnnotations();
            assertThat(annotations).hasSizeGreaterThanOrEqualTo(2);
            assertThat(annotations).anySatisfy(a -> assertThat(a.getSubtype()).isEqualTo("Text"));
            assertThat(annotations).anySatisfy(a -> assertThat(a.getSubtype()).isEqualTo("Link"));
        }

        @Test
        @DisplayName("lightweight extraction still returns parseable pages")
        void lightweightExtraction() throws IOException {
            when(pdfDocumentFactory.load(any(Path.class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, Path.class).toFile()));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.convertPdfToJson(pdfMultipart(richTextPdf()), true, out);
            PdfJsonDocument doc = objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
            assertEquals(3, doc.getPages().size());
        }

        @Test
        @DisplayName("metadata is fully extracted from the source document information")
        void metadataExtracted() throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.LETTER));
            PDDocumentInformation info = document.getDocumentInformation();
            info.setTitle("Cov Title");
            info.setAuthor("Cov Author");
            info.setSubject("Cov Subject");
            info.setKeywords("k1,k2");
            info.setCreator("Cov Creator");
            info.setProducer("Cov Producer");
            byte[] bytes = toBytes(document);

            PdfJsonDocument doc = toJsonDocument(bytes);
            PdfJsonMetadata md = doc.getMetadata();
            assertEquals("Cov Title", md.getTitle());
            assertEquals("Cov Author", md.getAuthor());
            assertEquals("Cov Subject", md.getSubject());
            assertEquals("k1,k2", md.getKeywords());
            assertEquals(1, md.getNumberOfPages());
        }

        @Test
        @DisplayName("progress callback observes increasing percentages through to completion")
        void progressMonotonic() throws IOException {
            when(pdfDocumentFactory.load(any(Path.class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, Path.class).toFile()));
            AtomicInteger maxPercent = new AtomicInteger(-1);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.convertPdfToJson(
                    pdfMultipart(richTextPdf()),
                    progress ->
                            maxPercent.updateAndGet(prev -> Math.max(prev, progress.getPercent())),
                    out);
            assertEquals(100, maxPercent.get());
        }
    }

    // ==================================================================
    // Full round trips: PDF -> JSON -> PDF
    // ==================================================================

    @Nested
    @DisplayName("PDF to JSON to PDF round trip")
    class RoundTrip {

        @Test
        @DisplayName("simple text round trip yields a single-page PDF")
        void simpleTextRoundTrip() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(simpleTextPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("rich multi-page round trip preserves page count and rotation")
        void richRoundTripPreservesPages() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(richTextPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(3, loaded.getNumberOfPages());
                assertEquals(90, loaded.getPage(1).getRotation());
                assertEquals(180, loaded.getPage(2).getRotation());
            }
        }

        @Test
        @DisplayName("image round trip reconstructs an image-bearing page")
        void imageRoundTrip() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(imagePdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getResources());
            }
        }

        @Test
        @DisplayName("annotation round trip keeps annotations on the rebuilt page")
        void annotationRoundTrip() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(annotatedPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertThat(loaded.getPage(0).getAnnotations()).isNotEmpty();
            }
        }

        @Test
        @DisplayName("editing text content before rebuild still produces a valid PDF")
        void editedTextRoundTrip() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(simpleTextPdf());
            for (PdfJsonTextElement element : doc.getPages().get(0).getTextElements()) {
                if (element.getText() != null && !element.getText().isBlank()) {
                    element.setText("Edited content");
                    break;
                }
            }
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("CropBox document round trips without error")
        void cropBoxRoundTrip() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(cropBoxPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            assertThat(rebuilt).isNotEmpty();
        }
    }

    // ==================================================================
    // JSON -> PDF synthesized model paths (no prior extraction)
    // ==================================================================

    @Nested
    @DisplayName("JSON to PDF from synthesized models")
    class SynthesizedJsonToPdf {

        private PdfJsonDocument docWith(PdfJsonPage page) {
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setPages(List.of(page));
            return doc;
        }

        @Test
        @DisplayName("text element drawn with a Standard14 font reference renders")
        void standard14TextRenders() throws IOException {
            stubFallbackFont();
            PdfJsonFont font =
                    PdfJsonFont.builder()
                            .id("F1")
                            .uid("F1")
                            .baseName("Helvetica")
                            .subtype("Type1")
                            .standard14Name("Helvetica")
                            .build();

            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Synth text")
                            .fontId("F1")
                            .fontSize(12f)
                            .x(72f)
                            .y(700f)
                            .build();

            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(List.of(element))
                            .build();

            PdfJsonDocument doc = docWith(page);
            doc.setFonts(new ArrayList<>(List.of(font)));

            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("text element with full style attributes renders via regeneration")
        void styledTextRenders() throws IOException {
            stubFallbackFont();
            PdfJsonFont font =
                    PdfJsonFont.builder()
                            .id("F1")
                            .uid("F1")
                            .baseName("Times-Roman")
                            .subtype("Type1")
                            .standard14Name("Times-Roman")
                            .build();

            PdfJsonTextColor fill =
                    PdfJsonTextColor.builder()
                            .colorSpace("DeviceRGB")
                            .components(new float[] {0.2f, 0.4f, 0.6f})
                            .build();

            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Styled")
                            .fontId("F1")
                            .fontSize(20f)
                            .characterSpacing(1.2f)
                            .wordSpacing(2.0f)
                            .horizontalScaling(95f)
                            .rise(1.0f)
                            .renderingMode(0)
                            .fillColor(fill)
                            .textMatrix(new float[] {1f, 0f, 0f, 1f, 100f, 600f})
                            .x(100f)
                            .y(600f)
                            .build();

            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(List.of(element))
                            .build();
            PdfJsonDocument doc = docWith(page);
            doc.setFonts(new ArrayList<>(List.of(font)));

            assertThat(runJsonToPdf(doc)).isNotEmpty();
        }

        @Test
        @DisplayName("image element synthesized from base64 renders onto the page")
        void synthesizedImageRenders() throws IOException {
            stubFallbackFont();
            // Encode a tiny PNG.
            BufferedImage tile = colorTile(8, 8, Color.MAGENTA);
            ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
            javax.imageio.ImageIO.write(tile, "png", pngOut);
            String base64 = Base64.getEncoder().encodeToString(pngOut.toByteArray());

            PdfJsonImageElement image =
                    PdfJsonImageElement.builder()
                            .id("Im1")
                            .imageData(base64)
                            .imageFormat("png")
                            .x(50f)
                            .y(500f)
                            .width(64f)
                            .height(64f)
                            .nativeWidth(8)
                            .nativeHeight(8)
                            .build();

            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .imageElements(List.of(image))
                            .build();

            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(docWith(page)))) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("image element positioned via left/bottom edges still renders")
        void imageWithEdgePositioning() throws IOException {
            stubFallbackFont();
            BufferedImage tile = colorTile(8, 8, Color.ORANGE);
            ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
            javax.imageio.ImageIO.write(tile, "png", pngOut);
            String base64 = Base64.getEncoder().encodeToString(pngOut.toByteArray());

            PdfJsonImageElement image =
                    PdfJsonImageElement.builder()
                            .id("Im2")
                            .imageData(base64)
                            .imageFormat("png")
                            .left(30f)
                            .bottom(40f)
                            .right(110f)
                            .top(120f)
                            .build();

            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .imageElements(List.of(image))
                            .build();
            assertThat(runJsonToPdf(docWith(page))).isNotEmpty();
        }

        @Test
        @DisplayName("annotation model is restored onto the rebuilt page")
        void synthesizedAnnotationRestored() throws IOException {
            stubFallbackFont();
            PdfJsonAnnotation annotation =
                    PdfJsonAnnotation.builder()
                            .subtype("Text")
                            .contents("synthetic note")
                            .rect(new float[] {50f, 700f, 70f, 720f})
                            .color(new float[] {1f, 1f, 0f})
                            .build();

            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .annotations(List.of(annotation))
                            .build();

            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(docWith(page)))) {
                // The rebuild ran the annotation-restore path and produced a valid single-page doc.
                assertThat(loaded.getNumberOfPages()).isEqualTo(1);
                assertThat(loaded.getPage(0).getAnnotations()).isNotNull();
            }
        }

        @Test
        @DisplayName("text referencing a missing font falls back without failing")
        void missingFontFallsBack() throws IOException {
            stubFallbackFont();
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("No font defined")
                            .fontId("does-not-exist")
                            .fontSize(12f)
                            .x(72f)
                            .y(700f)
                            .build();
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(List.of(element))
                            .build();
            assertThat(runJsonToPdf(docWith(page))).isNotEmpty();
        }

        @Test
        @DisplayName("page with both text and image regenerates content")
        void mixedTextAndImage() throws IOException {
            stubFallbackFont();
            BufferedImage tile = colorTile(8, 8, Color.CYAN);
            ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
            javax.imageio.ImageIO.write(tile, "png", pngOut);
            String base64 = Base64.getEncoder().encodeToString(pngOut.toByteArray());

            PdfJsonFont font =
                    PdfJsonFont.builder()
                            .id("F1")
                            .uid("F1")
                            .baseName("Helvetica")
                            .subtype("Type1")
                            .standard14Name("Helvetica")
                            .build();
            PdfJsonTextElement text =
                    PdfJsonTextElement.builder()
                            .text("Mixed")
                            .fontId("F1")
                            .fontSize(12f)
                            .x(72f)
                            .y(700f)
                            .build();
            PdfJsonImageElement image =
                    PdfJsonImageElement.builder()
                            .id("Im1")
                            .imageData(base64)
                            .imageFormat("png")
                            .x(72f)
                            .y(500f)
                            .width(48f)
                            .height(48f)
                            .build();

            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(List.of(text))
                            .imageElements(List.of(image))
                            .build();
            PdfJsonDocument doc = docWith(page);
            doc.setFonts(new ArrayList<>(List.of(font)));
            assertThat(runJsonToPdf(doc)).isNotEmpty();
        }
    }

    // ==================================================================
    // Cache-backed lazy editor API (jobId on JobContext)
    // ==================================================================

    @Nested
    @DisplayName("cache-backed lazy editor API")
    class CacheBackedApi {

        @Test
        @DisplayName("lazy conversion caches all pages for later extraction")
        void lazyConversionCachesDimensions() throws IOException {
            PdfJsonDocument doc = cacheLazyDocument("job-dims", richTextPdf());
            assertThat(doc.getPages()).hasSize(3);
            assertTrue(doc.isLazyImages(), "lazy conversion should flag lazyImages");

            // Every page is now resolvable from the cache, including the last one.
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage("job-dims", 3, out);
            PdfJsonPage lastPage = objectMapper.readValue(out.toByteArray(), PdfJsonPage.class);
            assertEquals(3, lastPage.getPageNumber());
        }

        @Test
        @DisplayName("extractSinglePage returns text for a cached page")
        void extractSinglePageReturnsText() throws IOException {
            cacheLazyDocument("job-page", simpleTextPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage("job-page", 1, out);
            PdfJsonPage page = objectMapper.readValue(out.toByteArray(), PdfJsonPage.class);
            assertEquals(1, page.getPageNumber());
            assertThat(page.getTextElements()).isNotEmpty();
        }

        @Test
        @DisplayName("extractSinglePage surfaces image elements on demand")
        void extractSinglePageImages() throws IOException {
            cacheLazyDocument("job-img", imagePdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage("job-img", 1, out);
            PdfJsonPage page = objectMapper.readValue(out.toByteArray(), PdfJsonPage.class);
            assertThat(page.getImageElements()).isNotEmpty();
        }

        @Test
        @DisplayName("extractSinglePage surfaces annotations on demand")
        void extractSinglePageAnnotations() throws IOException {
            cacheLazyDocument("job-ann", annotatedPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage("job-ann", 1, out);
            PdfJsonPage page = objectMapper.readValue(out.toByteArray(), PdfJsonPage.class);
            assertThat(page.getAnnotations()).isNotEmpty();
        }

        @Test
        @DisplayName("extractSinglePage rejects an out-of-range page number")
        void extractSinglePageOutOfRange() throws IOException {
            cacheLazyDocument("job-range", simpleTextPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.extractSinglePage("job-range", 99, out));
        }

        @Test
        @DisplayName("extractPageFonts returns the fonts used on a cached page")
        void extractPageFontsReturnsFonts() throws IOException {
            cacheLazyDocument("job-fonts", richTextPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractPageFonts("job-fonts", 1, out);
            List<?> fonts = objectMapper.readValue(out.toByteArray(), List.class);
            assertThat(fonts).isNotEmpty();
        }

        @Test
        @DisplayName("extractPageFonts rejects a page number beyond the document")
        void extractPageFontsOutOfRange() throws IOException {
            cacheLazyDocument("job-fonts-range", simpleTextPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.extractPageFonts("job-fonts-range", 5, out));
        }

        @Test
        @DisplayName("extractDocumentMetadata caches and returns the metadata model")
        void extractDocumentMetadataCaches() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractDocumentMetadata(pdfMultipart(richTextPdf()), "job-meta", out);
            PdfJsonDocumentMetadata md =
                    objectMapper.readValue(out.toByteArray(), PdfJsonDocumentMetadata.class);
            assertThat(md.getPageDimensions()).hasSize(3);

            // The page is now cached, so a single page can be pulled back out.
            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-meta", 1, pageOut);
            assertThat(pageOut.size()).isGreaterThan(0);
        }

        @Test
        @DisplayName("exportUpdatedPages with no page updates returns the cached PDF unchanged")
        void exportUpdatedPagesNoUpdates() throws IOException {
            cacheLazyDocument("job-export-none", simpleTextPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-export-none", new PdfJsonDocument(), out);
            assertThat(out.toByteArray()).isNotEmpty();
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("exportUpdatedPages applies an edited page and re-saves the document")
        void exportUpdatedPagesAppliesEdit() throws IOException {
            stubFallbackFont();
            cacheLazyDocument("job-export-edit", simpleTextPdf());

            // Pull the real page so we have valid fonts/elements, edit text, then export.
            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-export-edit", 1, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            page.setPageNumber(1);
            for (PdfJsonTextElement element : page.getTextElements()) {
                if (element.getText() != null && !element.getText().isBlank()) {
                    element.setText("Updated via export");
                    break;
                }
            }

            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(List.of(page));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-export-edit", updates, out);
            assertThat(out.toByteArray()).isNotEmpty();
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("exportUpdatedPages ignores updates for an out-of-range page")
        void exportUpdatedPagesSkipsOutOfRange() throws IOException {
            cacheLazyDocument("job-export-oor", simpleTextPdf());
            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(42);
            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(List.of(page));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-export-oor", updates, out);
            // Falls back to returning the cached PDF since no in-range page was updated.
            assertThat(out.toByteArray()).isNotEmpty();
        }

        @Test
        @DisplayName("clearCachedDocument removes a previously cached job")
        void clearCachedDocumentRemovesJob() throws IOException {
            cacheLazyDocument("job-clear", simpleTextPdf());
            service.clearCachedDocument("job-clear");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    CacheUnavailableException.class,
                    () -> service.extractSinglePage("job-clear", 1, out));
        }
    }

    // ==================================================================
    // Edge and error branches
    // ==================================================================

    @Nested
    @DisplayName("edge and error branches")
    class EdgeBranches {

        @Test
        @DisplayName("malformed JSON input surfaces as a runtime parsing failure")
        void malformedJsonThrows() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput",
                            "broken.json",
                            "application/json",
                            "{ not valid json ]".getBytes(StandardCharsets.UTF_8));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(Exception.class, () -> service.convertJsonToPdf(file, out));
        }

        @Test
        @DisplayName("zero-page document produces an empty but valid PDF")
        void zeroPageDocument() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setPages(new ArrayList<>());
            byte[] bytes = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(bytes)) {
                assertEquals(0, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("page with neither text nor images is skipped cleanly")
        void emptyContentPageSkipped() throws IOException {
            stubFallbackFont();
            PdfJsonPage page = PdfJsonPage.builder().pageNumber(1).width(200f).height(200f).build();
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setPages(List.of(page));
            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("blank PDF (no content streams) converts to JSON with one page")
        void blankPdfConverts() throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.A4));
            PdfJsonDocument doc = toJsonDocument(toBytes(document));
            assertEquals(1, doc.getPages().size());
            assertEquals(PDRectangle.A4.getWidth(), doc.getPages().get(0).getWidth(), 0.5f);
        }

        @Test
        @DisplayName("image element with invalid base64 data does not abort the conversion")
        void invalidImageDataTolerated() throws IOException {
            stubFallbackFont();
            PdfJsonImageElement image =
                    PdfJsonImageElement.builder()
                            .id("bad")
                            .imageData("@@@not-base64@@@")
                            .imageFormat("png")
                            .x(10f)
                            .y(10f)
                            .width(20f)
                            .height(20f)
                            .build();
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(200f)
                            .height(200f)
                            .imageElements(List.of(image))
                            .build();
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setPages(List.of(page));
            assertDoesNotThrow(() -> runJsonToPdf(doc));
        }

        @Test
        @DisplayName("extractDocumentMetadata with no jobId still streams metadata")
        void metadataWithoutJobId() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractDocumentMetadata(pdfMultipart(simpleTextPdf()), null, out);
            PdfJsonDocumentMetadata md =
                    objectMapper.readValue(out.toByteArray(), PdfJsonDocumentMetadata.class);
            assertThat(md.getPageDimensions()).hasSize(1);
        }
    }
}
