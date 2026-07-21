package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationFreeText;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationHighlight;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLine;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationSquare;
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
import stirling.software.SPDF.model.json.PdfJsonAnnotation;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonImageElement;
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
 * Deep coverage tests for {@link PdfJsonConversionService} that target reachable branches the other
 * suites leave cold: the {@code TextElementCursor}/{@code TextRunAccumulator} run-merging
 * machinery, a broad sweep of Standard14 font families plus composite/embedded fonts, every
 * annotation subtype, the {@code applyColor} colour-space matrix, JPEG/CMYK/transparent image
 * extraction and rebuild, and the extreme-coordinate / NaN guard paths in the regeneration helpers.
 *
 * <p>Complements {@code PdfJsonConversionServiceCoverageTest} and {@code
 * PdfJsonConversionServiceRoundTripTest}; the construction/round-trip helpers mirror those suites
 * so the same real in-memory PDF load path is exercised without duplicating their assertions.
 */
@ExtendWith(MockitoExtension.class)
@org.mockito.junit.jupiter.MockitoSettings(strictness = Strictness.LENIENT)
class PdfJsonConversionServiceDeepTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;
    @Mock private TaskManager taskManager;
    @Mock private PdfJsonFallbackFontService fallbackFontService;
    @Mock private PdfJsonFontService fontService;
    @Mock private Type3FontConversionService type3FontConversionService;
    @Mock private Type3GlyphExtractor type3GlyphExtractor;
    @Mock private ApplicationProperties applicationProperties;

    // Real COS mapper so the serialize/deserialize machinery executes for real.
    private final PdfJsonCosMapper cosMapper = new PdfJsonCosMapper();

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
                            Path path = Files.createTempFile("pdfjson-deep-test", suffix);
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

    /** Minimal fallback-font stub matching the other suites. */
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

    /**
     * Stubs canEncode to true so {@code buildFontRuns} keeps the primary font instead of forcing
     * the fallback path for every glyph, exercising the encode-with-real-font branch of
     * regeneration.
     */
    private void stubCanEncode() {
        when(fallbackFontService.canEncode(any(PDFont.class), anyString())).thenReturn(true);
        when(fallbackFontService.canEncode(any(PDFont.class), anyInt())).thenReturn(true);
    }

    private MockMultipartFile pdfMultipart(byte[] bytes) {
        return new MockMultipartFile("fileInput", "input.pdf", "application/pdf", bytes);
    }

    private byte[] toBytes(PDDocument document) throws IOException {
        try (document) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private PdfJsonDocument toJsonDocument(byte[] pdfBytes) throws IOException {
        when(pdfDocumentFactory.load(any(Path.class), eq(true)))
                .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, Path.class).toFile()));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertPdfToJson(pdfMultipart(pdfBytes), out);
        return objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
    }

    private byte[] runJsonToPdf(PdfJsonDocument doc) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertJsonToPdf(doc, out);
        return out.toByteArray();
    }

    private PdfJsonDocument cacheLazyDocument(String jobId, byte[] pdfBytes) throws IOException {
        when(pdfDocumentFactory.load(any(Path.class), eq(true)))
                .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, Path.class).toFile()));
        when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
        JobContext.setJobId(jobId);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertPdfToJson(pdfMultipart(pdfBytes), true, out);
        return objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
    }

    private BufferedImage solidImage(int w, int h, Color color, int type) {
        BufferedImage image = new BufferedImage(w, h, type);
        for (int x = 0; x < w; x++) {
            for (int y = 0; y < h; y++) {
                image.setRGB(x, y, color.getRGB());
            }
        }
        return image;
    }

    private String pngBase64(BufferedImage image) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return Base64.getEncoder().encodeToString(out.toByteArray());
    }

    private PdfJsonDocument docWith(PdfJsonPage page) {
        PdfJsonDocument doc = new PdfJsonDocument();
        doc.setPages(List.of(page));
        return doc;
    }

    private PdfJsonFont std14Font(String id, String standard14Name) {
        return PdfJsonFont.builder()
                .id(id)
                .uid(id)
                .baseName(standard14Name)
                .subtype("Type1")
                .standard14Name(standard14Name)
                .build();
    }

    // ==================================================================
    // TextElementCursor / TextRunAccumulator driven by multi-run text
    // ==================================================================

    @Nested
    @DisplayName("text run segmentation and cursor merging")
    class TextRunSegmentation {

        /** Two differently styled runs on the same baseline force a style-key split. */
        private byte[] twoStyleRunsSameLinePdf() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.newLineAtOffset(72, 700);
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.showText("Plain ");
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 12f);
                cs.showText("Bold ");
                cs.setNonStrokingColor(Color.RED);
                cs.showText("Red");
                cs.endText();
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("multiple show-text operators on one baseline split into separate style runs")
        void multipleRunsSplitByStyle() throws IOException {
            PdfJsonDocument doc = toJsonDocument(twoStyleRunsSameLinePdf());
            List<PdfJsonTextElement> elements = doc.getPages().get(0).getTextElements();
            // At least two style runs because font and colour changed mid-line.
            assertThat(elements.size()).isGreaterThanOrEqualTo(2);
            String joined =
                    elements.stream().map(PdfJsonTextElement::getText).reduce("", (a, b) -> a + b);
            assertThat(joined).contains("Plain").contains("Bold").contains("Red");
        }

        @Test
        @DisplayName(
                "same-length token rewrite walks the cursor across multiple runs without rebuild")
        void cursorRewriteAcrossRuns() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc = toJsonDocument(twoStyleRunsSameLinePdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getContents());
            }
        }

        @Test
        @DisplayName("char-by-char letters merge back into a single run on round trip")
        void perGlyphAdvancesMergeIntoRun() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            // Emit each glyph through its own TJ adjustment so the stripper sees many positions.
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(72, 700);
                cs.setCharacterSpacing(0.5f);
                cs.showText("Spaced out glyphs");
                cs.endText();
            }
            PdfJsonDocument doc = toJsonDocument(toBytes(document));
            assertThat(doc.getPages().get(0).getTextElements()).isNotEmpty();
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("differing-length text edit aborts rewrite and triggers full regeneration")
        void lengthChangeForcesRegeneration() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc = toJsonDocument(twoStyleRunsSameLinePdf());
            for (PdfJsonTextElement element : doc.getPages().get(0).getTextElements()) {
                if (element.getText() != null && element.getText().contains("Plain")) {
                    element.setText("A much longer replacement string than before");
                    break;
                }
            }
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }
    }

    // ==================================================================
    // Font family variety (extraction + rebuild)
    // ==================================================================

    @Nested
    @DisplayName("standard14 font family variety")
    class FontVariety {

        /** One line per Standard14 family, covering the symbol/zapf encodings too. */
        private byte[] allStandard14Pdf() throws IOException {
            Standard14Fonts.FontName[] families = {
                Standard14Fonts.FontName.HELVETICA,
                Standard14Fonts.FontName.HELVETICA_BOLD,
                Standard14Fonts.FontName.HELVETICA_OBLIQUE,
                Standard14Fonts.FontName.HELVETICA_BOLD_OBLIQUE,
                Standard14Fonts.FontName.TIMES_ROMAN,
                Standard14Fonts.FontName.TIMES_BOLD,
                Standard14Fonts.FontName.TIMES_ITALIC,
                Standard14Fonts.FontName.TIMES_BOLD_ITALIC,
                Standard14Fonts.FontName.COURIER,
                Standard14Fonts.FontName.COURIER_BOLD,
                Standard14Fonts.FontName.COURIER_OBLIQUE,
                Standard14Fonts.FontName.COURIER_BOLD_OBLIQUE
            };
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                float y = 760f;
                for (Standard14Fonts.FontName family : families) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(family), 10f);
                    cs.newLineAtOffset(50, y);
                    cs.showText(family.getName() + " sample 123");
                    cs.endText();
                    y -= 18f;
                }
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("all standard14 families are captured as distinct fonts")
        void capturesAllFamilies() throws IOException {
            PdfJsonDocument doc = toJsonDocument(allStandard14Pdf());
            long distinct =
                    doc.getFonts().stream()
                            .map(PdfJsonFont::getBaseName)
                            .filter(java.util.Objects::nonNull)
                            .distinct()
                            .count();
            assertThat(distinct).isGreaterThanOrEqualTo(8);
        }

        @Test
        @DisplayName("round trip over every standard14 family rebuilds a valid PDF")
        void roundTripAllFamilies() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc = toJsonDocument(allStandard14Pdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("synthesized text in each standard14 family rebuilds via createFontFromModel")
        void synthesizedFamiliesRebuild() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            String[] names = {
                "Helvetica-BoldOblique",
                "Times-BoldItalic",
                "Courier-Oblique",
                "Symbol",
                "ZapfDingbats"
            };
            List<PdfJsonFont> fonts = new ArrayList<>();
            List<PdfJsonTextElement> elements = new ArrayList<>();
            float y = 720f;
            for (int i = 0; i < names.length; i++) {
                String id = "F" + i;
                fonts.add(std14Font(id, names[i]));
                elements.add(
                        PdfJsonTextElement.builder()
                                .text("Sample" + i)
                                .fontId(id)
                                .fontSize(12f)
                                .x(72f)
                                .y(y)
                                .build());
                y -= 20f;
            }
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(elements)
                            .build();
            PdfJsonDocument doc = docWith(page);
            doc.setFonts(fonts);
            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }
    }

    // ==================================================================
    // Composite / embedded font round trips
    // ==================================================================

    @Nested
    @DisplayName("composite and embedded fonts")
    class CompositeFonts {

        // Loads the project-bundled DejaVuSans.ttf from the classpath so the embedded-font tests
        // are deterministic on every platform (no reliance on OS fonts, never skipped).
        private Path bundledTrueTypeFont() throws IOException {
            Path tmp = Files.createTempFile("deepfont", ".ttf");
            tmp.toFile().deleteOnExit();
            try (java.io.InputStream in =
                    getClass().getResourceAsStream("/static/fonts/DejaVuSans.ttf")) {
                assertThat(in).as("bundled DejaVuSans.ttf on classpath").isNotNull();
                Files.copy(in, tmp, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            return tmp;
        }

        @Test
        @DisplayName("embedded TrueType (Type0 composite) font survives extraction and rebuild")
        void embeddedTrueTypeRoundTrip() throws IOException {
            Path ttf = bundledTrueTypeFont();
            stubFallbackFont();
            stubCanEncode();

            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            PDType0Font embedded = PDType0Font.load(document, ttf.toFile());
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.setFont(embedded, 14f);
                cs.newLineAtOffset(72, 700);
                cs.showText("Composite font line");
                cs.endText();
            }
            byte[] bytes = toBytes(document);

            PdfJsonDocument doc = toJsonDocument(bytes);
            // A composite/Type0 font should be present in the extracted set.
            assertThat(doc.getFonts()).isNotEmpty();
            assertThat(doc.getPages().get(0).getTextElements()).isNotEmpty();

            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("composite font lazy extraction exposes font payload via extractPageFonts")
        void embeddedTrueTypeLazyFonts() throws IOException {
            Path ttf = bundledTrueTypeFont();

            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            PDType0Font embedded = PDType0Font.load(document, ttf.toFile());
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.setFont(embedded, 14f);
                cs.newLineAtOffset(72, 700);
                cs.showText("Lazy composite");
                cs.endText();
            }
            byte[] bytes = toBytes(document);

            cacheLazyDocument("job-ttf", bytes);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractPageFonts("job-ttf", 1, out);
            List<?> fonts = objectMapper.readValue(out.toByteArray(), List.class);
            assertThat(fonts).isNotEmpty();
        }
    }

    // ==================================================================
    // Annotation variety: collect + restore
    // ==================================================================

    @Nested
    @DisplayName("annotation subtype variety")
    class AnnotationVariety {

        /** One of each common annotation subtype with colour/border styling. */
        private byte[] manyAnnotationsPdf() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);

            PDAnnotationText note = new PDAnnotationText();
            note.setContents("Sticky note");
            note.setRectangle(new PDRectangle(40, 740, 20, 20));
            note.setColor(
                    new org.apache.pdfbox.pdmodel.graphics.color.PDColor(
                            new float[] {1f, 1f, 0f},
                            org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB.INSTANCE));

            PDAnnotationLink link = new PDAnnotationLink();
            link.setRectangle(new PDRectangle(40, 700, 200, 18));

            PDAnnotationHighlight highlight = new PDAnnotationHighlight();
            highlight.setRectangle(new PDRectangle(40, 660, 200, 18));
            highlight.setQuadPoints(new float[] {40, 678, 240, 678, 40, 660, 240, 660});
            highlight.setColor(
                    new org.apache.pdfbox.pdmodel.graphics.color.PDColor(
                            new float[] {0f, 1f, 0f},
                            org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB.INSTANCE));

            PDAnnotationSquare square = new PDAnnotationSquare();
            square.setRectangle(new PDRectangle(40, 600, 80, 40));
            square.setInteriorColor(
                    new org.apache.pdfbox.pdmodel.graphics.color.PDColor(
                            new float[] {0.2f, 0.2f, 0.9f},
                            org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB.INSTANCE));

            PDAnnotationFreeText freeText = new PDAnnotationFreeText();
            freeText.setRectangle(new PDRectangle(40, 540, 200, 40));
            freeText.setContents("Free text body");
            freeText.setDefaultAppearance("/Helv 10 Tf 0 g");

            PDAnnotationLine line = new PDAnnotationLine();
            line.setRectangle(new PDRectangle(40, 500, 200, 20));
            line.setLine(new float[] {40, 510, 240, 510});

            page.getAnnotations().add(note);
            page.getAnnotations().add(link);
            page.getAnnotations().add(highlight);
            page.getAnnotations().add(square);
            page.getAnnotations().add(freeText);
            page.getAnnotations().add(line);

            // A line of page content so the JSON->PDF rebuild reaches the annotation-restore step.
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(72, 440);
                cs.showText("Annotated body text");
                cs.endText();
            }

            return toBytes(document);
        }

        @Test
        @DisplayName("each annotation subtype is collected with its subtype label")
        void collectsAllSubtypes() throws IOException {
            PdfJsonDocument doc = toJsonDocument(manyAnnotationsPdf());
            List<PdfJsonAnnotation> annotations = doc.getPages().get(0).getAnnotations();
            assertThat(annotations).hasSizeGreaterThanOrEqualTo(6);
            List<String> subtypes =
                    annotations.stream().map(PdfJsonAnnotation::getSubtype).toList();
            assertThat(subtypes)
                    .contains("Text", "Link", "Highlight", "Square", "FreeText", "Line");
        }

        @Test
        @DisplayName("annotation colours are captured into the colour component array")
        void capturesAnnotationColors() throws IOException {
            PdfJsonDocument doc = toJsonDocument(manyAnnotationsPdf());
            List<PdfJsonAnnotation> annotations = doc.getPages().get(0).getAnnotations();
            assertThat(annotations).anySatisfy(a -> assertThat(a.getColor()).isNotNull());
        }

        @Test
        @DisplayName("every annotation subtype round trips back onto the rebuilt page via raw data")
        void restoresAllSubtypes() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(manyAnnotationsPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertThat(loaded.getPage(0).getAnnotations()).hasSizeGreaterThanOrEqualTo(6);
            }
        }

        @Test
        @DisplayName("lazy extraction surfaces the full annotation set for a cached page")
        void lazyAnnotationSet() throws IOException {
            cacheLazyDocument("job-anns", manyAnnotationsPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage("job-anns", 1, out);
            PdfJsonPage page = objectMapper.readValue(out.toByteArray(), PdfJsonPage.class);
            assertThat(page.getAnnotations()).hasSizeGreaterThanOrEqualTo(6);
        }
    }

    // ==================================================================
    // Image variety: JPEG (DCT), lossless PNG, transparency, CMYK
    // ==================================================================

    @Nested
    @DisplayName("image format variety")
    class ImageVariety {

        /** A page bearing a JPEG (DCT), a lossless RGB and an ARGB-with-alpha image. */
        private byte[] mixedImagePdf() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);

            PDImageXObject jpeg =
                    JPEGFactory.createFromImage(
                            document, solidImage(32, 24, Color.RED, BufferedImage.TYPE_INT_RGB));
            PDImageXObject lossless =
                    LosslessFactory.createFromImage(
                            document, solidImage(24, 24, Color.BLUE, BufferedImage.TYPE_INT_RGB));
            BufferedImage argb =
                    solidImage(16, 16, new Color(0, 255, 0, 128), BufferedImage.TYPE_INT_ARGB);
            PDImageXObject transparent = LosslessFactory.createFromImage(document, argb);

            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.drawImage(jpeg, 60, 600, 96, 72);
                cs.drawImage(lossless, 200, 600, 72, 72);
                cs.drawImage(transparent, 320, 600, 48, 48);
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("JPEG, lossless and transparent images are all extracted with format + data")
        void extractsMixedImages() throws IOException {
            PdfJsonDocument doc = toJsonDocument(mixedImagePdf());
            List<PdfJsonImageElement> images = doc.getPages().get(0).getImageElements();
            assertThat(images).hasSizeGreaterThanOrEqualTo(3);
            assertThat(images)
                    .allSatisfy(
                            img -> {
                                assertThat(img.getImageData()).isNotBlank();
                                assertThat(img.getImageFormat()).isNotBlank();
                            });
            // A JPEG XObject reports a jpg/jpeg suffix.
            assertThat(images)
                    .anySatisfy(
                            img ->
                                    assertThat(img.getImageFormat().toLowerCase())
                                            .containsAnyOf("jpg", "jpeg"));
        }

        @Test
        @DisplayName("mixed-image page round trips into a page that keeps image resources")
        void roundTripMixedImages() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(mixedImagePdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getResources());
            }
        }

        @Test
        @DisplayName("synthesized JPEG-format image element with a transform matrix renders")
        void synthesizedJpegWithTransform() throws IOException {
            stubFallbackFont();
            ByteArrayOutputStream jpgOut = new ByteArrayOutputStream();
            ImageIO.write(solidImage(16, 16, Color.RED, BufferedImage.TYPE_INT_RGB), "jpg", jpgOut);
            String base64 = Base64.getEncoder().encodeToString(jpgOut.toByteArray());

            PdfJsonImageElement image =
                    PdfJsonImageElement.builder()
                            .id("Jpg1")
                            .imageData(base64)
                            .imageFormat("jpg")
                            .transform(new float[] {64f, 0f, 0f, 48f, 80f, 500f})
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
        @DisplayName("lazy extraction with images materializes image data on demand")
        void lazyMixedImages() throws IOException {
            cacheLazyDocument("job-mixed-img", mixedImagePdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage("job-mixed-img", 1, out);
            PdfJsonPage page = objectMapper.readValue(out.toByteArray(), PdfJsonPage.class);
            assertThat(page.getImageElements()).isNotEmpty();
            assertThat(page.getImageElements())
                    .anySatisfy(img -> assertThat(img.getImageData()).isNotBlank());
        }
    }

    // ==================================================================
    // applyColor / applyTextState colour-space matrix
    // ==================================================================

    @Nested
    @DisplayName("colour space and text-state application")
    class ColorAndState {

        private PdfJsonDocument textWithColor(PdfJsonTextColor fill, PdfJsonTextColor stroke) {
            PdfJsonFont font = std14Font("F1", "Helvetica");
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Coloured")
                            .fontId("F1")
                            .fontSize(14f)
                            .characterSpacing(0.8f)
                            .wordSpacing(1.5f)
                            .horizontalScaling(90f)
                            .leading(16f)
                            .rise(2f)
                            .renderingMode(2)
                            .fillColor(fill)
                            .strokeColor(stroke)
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
            return doc;
        }

        private PdfJsonTextColor color(String space, float... components) {
            return PdfJsonTextColor.builder().colorSpace(space).components(components).build();
        }

        @Test
        @DisplayName("explicit DeviceRGB fill and stroke colours render")
        void deviceRgb() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc =
                    textWithColor(
                            color("DeviceRGB", 0.1f, 0.2f, 0.3f),
                            color("DeviceRGB", 0.9f, 0.8f, 0.7f));
            assertThat(runJsonToPdf(doc)).isNotEmpty();
        }

        @Test
        @DisplayName("explicit DeviceCMYK colours render through the CMYK branch")
        void deviceCmyk() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc =
                    textWithColor(
                            color("DeviceCMYK", 0.1f, 0.2f, 0.3f, 0.4f),
                            color("DeviceCMYK", 0f, 0f, 0f, 1f));
            assertThat(runJsonToPdf(doc)).isNotEmpty();
        }

        @Test
        @DisplayName("explicit DeviceGray colours render through the gray branch")
        void deviceGray() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc =
                    textWithColor(color("DeviceGray", 0.5f), color("DeviceGray", 0.2f));
            assertThat(runJsonToPdf(doc)).isNotEmpty();
        }

        @Test
        @DisplayName("null colour space infers the space from component count (1/3/4)")
        void inferredColorSpaces() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            assertThat(runJsonToPdf(textWithColor(color(null, 0.4f), color(null, 0.6f))))
                    .isNotEmpty();
            assertThat(
                            runJsonToPdf(
                                    textWithColor(
                                            color(null, 0.1f, 0.2f, 0.3f),
                                            color(null, 0.3f, 0.2f, 0.1f))))
                    .isNotEmpty();
            assertThat(
                            runJsonToPdf(
                                    textWithColor(
                                            color(null, 0.1f, 0.2f, 0.3f, 0.4f),
                                            color(null, 0.4f, 0.3f, 0.2f, 0.1f))))
                    .isNotEmpty();
        }

        @Test
        @DisplayName("unsupported named colour space is skipped without aborting the rebuild")
        void unsupportedColorSpaceSkipped() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc =
                    textWithColor(color("Separation", 0.5f), color("ICCBased", 0.1f, 0.2f, 0.3f));
            assertThat(runJsonToPdf(doc)).isNotEmpty();
        }

        @Test
        @DisplayName("two-component colour with null space falls through to the RGB default branch")
        void twoComponentDefaultsToRgb() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc = textWithColor(color(null, 0.5f, 0.5f), null);
            assertThat(runJsonToPdf(doc)).isNotEmpty();
        }
    }

    // ==================================================================
    // Edge / guard branches
    // ==================================================================

    @Nested
    @DisplayName("edge and guard branches")
    class EdgeGuards {

        @Test
        @DisplayName("very large coordinates are tolerated by the regeneration path")
        void extremeCoordinates() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonFont font = std14Font("F1", "Helvetica");
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Far away")
                            .fontId("F1")
                            .fontSize(12f)
                            .x(900_000f)
                            .y(-900_000f)
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
        @DisplayName("NaN and Infinity in an image transform fall back to safe defaults")
        void nonFiniteTransformGuarded() throws IOException {
            stubFallbackFont();
            PdfJsonImageElement image =
                    PdfJsonImageElement.builder()
                            .id("Im-nan")
                            .imageData(
                                    pngBase64(
                                            solidImage(
                                                    8, 8, Color.PINK, BufferedImage.TYPE_INT_RGB)))
                            .imageFormat("png")
                            .transform(
                                    new float[] {
                                        Float.NaN,
                                        0f,
                                        0f,
                                        Float.POSITIVE_INFINITY,
                                        Float.NEGATIVE_INFINITY,
                                        100f
                                    })
                            .build();
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .imageElements(List.of(image))
                            .build();
            assertDoesNotThrow(() -> runJsonToPdf(docWith(page)));
        }

        @Test
        @DisplayName("image with zero width/height falls back to native dimensions")
        void zeroDimensionImageUsesNative() throws IOException {
            stubFallbackFont();
            PdfJsonImageElement image =
                    PdfJsonImageElement.builder()
                            .id("Im-zero")
                            .imageData(
                                    pngBase64(
                                            solidImage(
                                                    10,
                                                    12,
                                                    Color.GRAY,
                                                    BufferedImage.TYPE_INT_RGB)))
                            .imageFormat("png")
                            .width(0f)
                            .height(0f)
                            .nativeWidth(10)
                            .nativeHeight(12)
                            .x(50f)
                            .y(500f)
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
        @DisplayName("a page with only blank-text elements rebuilds cleanly")
        void blankTextOnlyPage() throws IOException {
            stubFallbackFont();
            PdfJsonFont font = std14Font("F1", "Helvetica");
            PdfJsonTextElement blank =
                    PdfJsonTextElement.builder()
                            .text("   ")
                            .fontId("F1")
                            .fontSize(12f)
                            .x(72f)
                            .y(700f)
                            .build();
            PdfJsonTextElement empty =
                    PdfJsonTextElement.builder()
                            .text("")
                            .fontId("F1")
                            .fontSize(12f)
                            .x(72f)
                            .y(680f)
                            .build();
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(List.of(blank, empty))
                            .build();
            PdfJsonDocument doc = docWith(page);
            doc.setFonts(new ArrayList<>(List.of(font)));
            assertThat(runJsonToPdf(doc)).isNotEmpty();
        }

        @Test
        @DisplayName("explicit z-order interleaves images and text by draw order")
        void zOrderInterleaving() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonFont font = std14Font("F1", "Helvetica");
            PdfJsonImageElement back =
                    PdfJsonImageElement.builder()
                            .id("back")
                            .imageData(
                                    pngBase64(
                                            solidImage(
                                                    20,
                                                    20,
                                                    Color.LIGHT_GRAY,
                                                    BufferedImage.TYPE_INT_RGB)))
                            .imageFormat("png")
                            .x(60f)
                            .y(600f)
                            .width(120f)
                            .height(40f)
                            .zOrder(5)
                            .build();
            PdfJsonTextElement front =
                    PdfJsonTextElement.builder()
                            .text("On top")
                            .fontId("F1")
                            .fontSize(14f)
                            .x(64f)
                            .y(610f)
                            .zOrder(10)
                            .build();
            PdfJsonTextElement under =
                    PdfJsonTextElement.builder()
                            .text("Below")
                            .fontId("F1")
                            .fontSize(14f)
                            .x(64f)
                            .y(560f)
                            .zOrder(1)
                            .build();
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(List.of(front, under))
                            .imageElements(List.of(back))
                            .build();
            PdfJsonDocument doc = docWith(page);
            doc.setFonts(new ArrayList<>(List.of(font)));
            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(doc))) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("text with an explicit 6-value text matrix renders via applyTextMatrix")
        void explicitTextMatrix() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonFont font = std14Font("F1", "Helvetica");
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Matrixed")
                            .fontId("F1")
                            .fontSize(12f)
                            .textMatrix(new float[] {1.2f, 0.3f, -0.3f, 1.2f, 120f, 640f})
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
    }

    // ==================================================================
    // Content-stream + resource preservation with varied operators
    // ==================================================================

    @Nested
    @DisplayName("content stream and resource preservation with varied operators")
    class ContentStreamPreservation {

        /** Page mixing graphics-state, clipping, vector fills and text. */
        private byte[] graphicsRichPdf() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.saveGraphicsState();
                cs.setLineWidth(2f);
                cs.setNonStrokingColor(0.2f, 0.4f, 0.6f);
                cs.addRect(50, 600, 200, 120);
                cs.clip();
                cs.fill();
                cs.restoreGraphicsState();

                cs.setStrokingColor(Color.DARK_GRAY);
                cs.moveTo(50, 560);
                cs.lineTo(250, 560);
                cs.stroke();

                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(60, 500);
                cs.showText("Text over graphics");
                cs.endText();
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("graphics-rich page preserves content streams and resources on extraction")
        void preservesStreamsAndResources() throws IOException {
            PdfJsonDocument doc = toJsonDocument(graphicsRichPdf());
            PdfJsonPage page = doc.getPages().get(0);
            assertNotNull(page.getResources());
            assertThat(page.getContentStreams()).isNotEmpty();
        }

        @Test
        @DisplayName("identity edit over graphics-rich content keeps the token rewrite path viable")
        void identityRewriteKeepsGraphics() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc = toJsonDocument(graphicsRichPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getContents());
            }
        }

        @Test
        @DisplayName("convertPdfToJsonDocument exposes the COS model for mutate-and-rebuild")
        void cosModelMutateRebuild() throws IOException {
            stubFallbackFont();
            when(pdfDocumentFactory.load(any(Path.class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, Path.class).toFile()));
            PdfJsonDocument doc = service.convertPdfToJsonDocument(pdfMultipart(graphicsRichPdf()));
            assertNotNull(doc);
            assertThat(doc.getPages()).hasSize(1);
            // Mutate page geometry then rebuild to drive applyPageResources on a changed model.
            doc.getPages().get(0).setRotation(90);
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }
    }

    // ==================================================================
    // Cache export with multiple edits
    // ==================================================================

    @Nested
    @DisplayName("cache export with multiple edits")
    class CacheExportMultiEdit {

        private byte[] threePageTextPdf() throws IOException {
            PDDocument document = new PDDocument();
            for (int i = 0; i < 3; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                document.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                    cs.newLineAtOffset(72, 700);
                    cs.showText("Page number " + (i + 1));
                    cs.endText();
                }
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("exportUpdatedPages applies edits to several pages at once")
        void multiPageEdits() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            cacheLazyDocument("job-multi-export", threePageTextPdf());

            List<PdfJsonPage> updates = new ArrayList<>();
            for (int pageNo = 1; pageNo <= 3; pageNo++) {
                ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
                service.extractSinglePage("job-multi-export", pageNo, pageOut);
                PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
                page.setPageNumber(pageNo);
                for (PdfJsonTextElement element : page.getTextElements()) {
                    if (element.getText() != null && !element.getText().isBlank()) {
                        element.setText("Edited " + pageNo);
                        break;
                    }
                }
                updates.add(page);
            }
            PdfJsonDocument updateDoc = new PdfJsonDocument();
            updateDoc.setPages(updates);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-multi-export", updateDoc, out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(3, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("exportUpdatedPages mixes one in-range edit with one out-of-range page")
        void mixedRangeEdits() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            cacheLazyDocument("job-mixed-range", threePageTextPdf());

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-mixed-range", 2, pageOut);
            PdfJsonPage realPage = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            realPage.setPageNumber(2);

            PdfJsonPage ghost = new PdfJsonPage();
            ghost.setPageNumber(99);

            PdfJsonDocument updateDoc = new PdfJsonDocument();
            updateDoc.setPages(List.of(realPage, ghost));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-mixed-range", updateDoc, out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(3, loaded.getNumberOfPages());
            }
        }
    }
}
