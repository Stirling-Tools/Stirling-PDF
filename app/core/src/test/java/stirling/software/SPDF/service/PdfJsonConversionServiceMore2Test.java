package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionGoTo;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitDestination;
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
 * Additional coverage tests for {@link PdfJsonConversionService} targeting reachable branches the
 * other suites leave cold: link annotations carrying URI / GoTo actions plus widget annotations,
 * the {@code restoreAnnotations} structured-fallback path when no rawData is present, page rotation
 * (90/180/270) combined with a CropBox that differs from the MediaBox, document- and page-level
 * metadata edge cases (all-null fields, empty strings, keyword/creator/producer round trips), the
 * XMP packet extract-then-apply round trip, multi-image pages mixing JPEG (DCTDecode) and lossless
 * PNG with explicit-transform versus default placement, and the cache/editor API around export
 * edits and clear-then-miss.
 *
 * <p>Construction mirrors {@code PdfJsonConversionServiceDeepTest} and {@code
 * PdfJsonConversionServiceExtraTest} so the same real in-memory PDF load path runs without
 * repeating their assertions.
 */
@ExtendWith(MockitoExtension.class)
@org.mockito.junit.jupiter.MockitoSettings(strictness = Strictness.LENIENT)
class PdfJsonConversionServiceMore2Test {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;
    @Mock private TaskManager taskManager;
    @Mock private PdfJsonFallbackFontService fallbackFontService;
    @Mock private PdfJsonFontService fontService;
    @Mock private Type3FontConversionService type3FontConversionService;
    @Mock private Type3GlyphExtractor type3GlyphExtractor;
    @Mock private ApplicationProperties applicationProperties;

    // Real COS mapper so the serialize/deserialize machinery runs for real.
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
                            Path path = Files.createTempFile("pdfjson-more2-test", suffix);
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

    private String jpgBase64(BufferedImage image) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", out);
        return Base64.getEncoder().encodeToString(out.toByteArray());
    }

    private PdfJsonDocument docWith(PdfJsonPage page) {
        PdfJsonDocument doc = new PdfJsonDocument();
        doc.setPages(new ArrayList<>(List.of(page)));
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

    private byte[] simpleTextPdf(String text) throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
            cs.newLineAtOffset(72, 700);
            cs.showText(text);
            cs.endText();
        }
        return toBytes(document);
    }

    // ==================================================================
    // Link / action / widget annotations
    // ==================================================================

    @Nested
    @DisplayName("link, action and widget annotation handling")
    class ActionAnnotations {

        /** A page carrying a URI-action link, a GoTo-action link and a widget annotation. */
        private byte[] actionAnnotationPdf() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);

            PDAnnotationLink uriLink = new PDAnnotationLink();
            uriLink.setRectangle(new PDRectangle(40, 720, 200, 18));
            PDActionURI uriAction = new PDActionURI();
            uriAction.setURI("https://example.com/landing");
            uriLink.setAction(uriAction);

            PDAnnotationLink gotoLink = new PDAnnotationLink();
            gotoLink.setRectangle(new PDRectangle(40, 690, 200, 18));
            PDActionGoTo gotoAction = new PDActionGoTo();
            PDPageFitDestination dest = new PDPageFitDestination();
            dest.setPage(page);
            gotoAction.setDestination(dest);
            gotoLink.setAction(gotoAction);

            PDAnnotationWidget widget = new PDAnnotationWidget();
            widget.setRectangle(new PDRectangle(40, 650, 120, 24));

            page.getAnnotations().add(uriLink);
            page.getAnnotations().add(gotoLink);
            page.getAnnotations().add(widget);

            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(72, 600);
                cs.showText("Body with action links");
                cs.endText();
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("URI, GoTo and widget annotations are collected with their subtypes")
        void collectsActionSubtypes() throws IOException {
            PdfJsonDocument doc = toJsonDocument(actionAnnotationPdf());
            List<PdfJsonAnnotation> annotations = doc.getPages().get(0).getAnnotations();
            assertThat(annotations).hasSizeGreaterThanOrEqualTo(3);
            List<String> subtypes =
                    annotations.stream().map(PdfJsonAnnotation::getSubtype).toList();
            assertThat(subtypes).contains("Link", "Widget");
        }

        @Test
        @DisplayName("URI and GoTo action links round trip back onto the rebuilt page")
        void actionLinksRoundTrip() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(actionAnnotationPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertThat(loaded.getPage(0).getAnnotations()).hasSizeGreaterThanOrEqualTo(3);
                boolean hasUri =
                        loaded.getPage(0).getAnnotations().stream()
                                .anyMatch(
                                        a ->
                                                a instanceof PDAnnotationLink
                                                        && ((PDAnnotationLink) a).getAction()
                                                                instanceof PDActionURI);
                assertThat(hasUri).isTrue();
            }
        }

        @Test
        @DisplayName("structured annotation without rawData hits the fallback restore branch")
        void structuredAnnotationFallbackRestore() throws IOException {
            stubFallbackFont();
            // No rawData supplied so restoreAnnotations takes the basic-reconstruction warning
            // path.
            PdfJsonAnnotation noRaw =
                    PdfJsonAnnotation.builder()
                            .subtype("Text")
                            .contents("structured only")
                            .rect(new float[] {40f, 700f, 60f, 720f})
                            .color(new float[] {1f, 0f, 0f})
                            .author("Author X")
                            .subject("Subject Y")
                            .destination("page-1")
                            .iconName("Comment")
                            .build();
            PdfJsonFont font = std14Font("F1", "Helvetica");
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Body line")
                            .fontId("F1")
                            .fontSize(12f)
                            .x(72f)
                            .y(640f)
                            .build();
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(new ArrayList<>(List.of(element)))
                            .annotations(new ArrayList<>(List.of(noRaw)))
                            .build();
            PdfJsonDocument doc = docWith(page);
            doc.setFonts(new ArrayList<>(List.of(font)));
            // The annotation has no rawData; rebuild must not abort and the body still renders.
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("lazy extraction surfaces action-link annotations for a cached page")
        void lazyActionAnnotations() throws IOException {
            cacheLazyDocument("job-action-anns", actionAnnotationPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage("job-action-anns", 1, out);
            PdfJsonPage page = objectMapper.readValue(out.toByteArray(), PdfJsonPage.class);
            assertThat(page.getAnnotations()).hasSizeGreaterThanOrEqualTo(3);
        }
    }

    // ==================================================================
    // Rotation + CropBox geometry
    // ==================================================================

    @Nested
    @DisplayName("rotation combined with a non-default CropBox")
    class RotationCropBox {

        /** Letter MediaBox with a smaller inset CropBox and the supplied rotation. */
        private byte[] rotatedCroppedPdf(int rotation) throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            page.setRotation(rotation);
            page.setCropBox(new PDRectangle(36f, 48f, 480f, 600f));
            document.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(100, 300);
                cs.showText("Rotated and cropped " + rotation);
                cs.endText();
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("rotation 90 reports the CropBox dimensions and survives rebuild")
        void rotation90() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(rotatedCroppedPdf(90));
            PdfJsonPage page = doc.getPages().get(0);
            assertEquals(90, page.getRotation());
            // Extraction reports CropBox geometry, not the larger MediaBox.
            assertEquals(480f, page.getWidth(), 0.5f);
            assertEquals(600f, page.getHeight(), 0.5f);
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(90, loaded.getPage(0).getRotation());
            }
        }

        @Test
        @DisplayName("rotation 180 keeps both rotation and crop geometry through a round trip")
        void rotation180() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(rotatedCroppedPdf(180));
            assertEquals(180, doc.getPages().get(0).getRotation());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(180, loaded.getPage(0).getRotation());
                PDRectangle box = loaded.getPage(0).getMediaBox();
                assertEquals(480f, box.getWidth(), 0.5f);
                assertEquals(600f, box.getHeight(), 0.5f);
            }
        }

        @Test
        @DisplayName("rotation 270 round trips and reports crop geometry on extraction")
        void rotation270() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(rotatedCroppedPdf(270));
            assertEquals(270, doc.getPages().get(0).getRotation());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(270, loaded.getPage(0).getRotation());
            }
        }

        @Test
        @DisplayName("metadata extraction reports rotation per page from the MediaBox path")
        void metadataReportsRotation() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractDocumentMetadata(pdfMultipart(rotatedCroppedPdf(90)), "job-rot", out);
            PdfJsonDocumentMetadata md =
                    objectMapper.readValue(out.toByteArray(), PdfJsonDocumentMetadata.class);
            assertThat(md.getPageDimensions()).hasSize(1);
            assertEquals(90, md.getPageDimensions().get(0).getRotation());
        }
    }

    // ==================================================================
    // Metadata edge cases (document and synthesized)
    // ==================================================================

    @Nested
    @DisplayName("metadata edge cases")
    class MetadataEdgeCases {

        @Test
        @DisplayName("a document with no information dictionary fields extracts blank metadata")
        void emptyDocumentInfoExtractsBlanks() throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.LETTER));
            PdfJsonDocument doc = toJsonDocument(toBytes(document));
            PdfJsonMetadata md = doc.getMetadata();
            assertNotNull(md);
            assertThat(md.getTitle()).isNull();
            assertThat(md.getAuthor()).isNull();
            assertEquals(1, md.getNumberOfPages());
        }

        @Test
        @DisplayName("all-null synthesized metadata applies cleanly without dates")
        void allNullMetadataApplies() throws IOException {
            stubFallbackFont();
            PdfJsonMetadata md = PdfJsonMetadata.builder().build();
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(md);
            doc.setPages(new ArrayList<>());
            assertDoesNotThrow(() -> runJsonToPdf(doc));
        }

        @Test
        @DisplayName("keywords, creator and producer survive a metadata round trip")
        void keywordsCreatorProducerRoundTrip() throws IOException {
            stubFallbackFont();
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.LETTER));
            document.getDocumentInformation().setKeywords("alpha, beta, gamma");
            document.getDocumentInformation().setCreator("Creator Tool");
            document.getDocumentInformation().setProducer("Producer Lib");
            document.getDocumentInformation().setSubject("Round trip subject");
            byte[] bytes = toBytes(document);

            PdfJsonDocument doc = toJsonDocument(bytes);
            assertThat(doc.getMetadata().getKeywords()).isEqualTo("alpha, beta, gamma");

            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals("alpha, beta, gamma", loaded.getDocumentInformation().getKeywords());
                assertEquals("Creator Tool", loaded.getDocumentInformation().getCreator());
                assertEquals("Producer Lib", loaded.getDocumentInformation().getProducer());
                assertEquals("Round trip subject", loaded.getDocumentInformation().getSubject());
            }
        }

        @Test
        @DisplayName("empty-string metadata fields round trip without becoming null")
        void emptyStringMetadataFields() throws IOException {
            stubFallbackFont();
            PdfJsonMetadata md =
                    PdfJsonMetadata.builder().title("").author("").keywords("").build();
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(md);
            doc.setPages(new ArrayList<>());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals("", loaded.getDocumentInformation().getTitle());
            }
        }
    }

    // ==================================================================
    // XMP metadata extract-then-apply round trip
    // ==================================================================

    @Nested
    @DisplayName("XMP metadata round trip")
    class XmpRoundTrip {

        private byte[] xmpPacket(String title) {
            return ("<?xpacket begin=\"\uFEFF\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>"
                            + "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">"
                            + "<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"
                            + "<rdf:Description xmlns:dc=\"http://purl.org/dc/elements/1.1/\">"
                            + "<dc:title>"
                            + title
                            + "</dc:title>"
                            + "</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end=\"w\"?>")
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }

        private byte[] pdfWithXmp(String title) throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.LETTER));
            org.apache.pdfbox.pdmodel.common.PDMetadata metadata =
                    new org.apache.pdfbox.pdmodel.common.PDMetadata(
                            document, new java.io.ByteArrayInputStream(xmpPacket(title)));
            document.getDocumentCatalog().setMetadata(metadata);
            return toBytes(document);
        }

        @Test
        @DisplayName("an XMP packet is extracted as base64 into the document model")
        void xmpExtractedAsBase64() throws IOException {
            PdfJsonDocument doc = toJsonDocument(pdfWithXmp("XMP Title One"));
            assertThat(doc.getXmpMetadata()).isNotBlank();
            byte[] decoded = Base64.getDecoder().decode(doc.getXmpMetadata());
            String xml = new String(decoded, java.nio.charset.StandardCharsets.UTF_8);
            assertThat(xml).contains("XMP Title One");
        }

        @Test
        @DisplayName("an extracted XMP packet is restored onto the rebuilt document catalog")
        void xmpRestoredOnRebuild() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(pdfWithXmp("XMP Title Two"));
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                org.apache.pdfbox.pdmodel.common.PDMetadata restored =
                        loaded.getDocumentCatalog().getMetadata();
                assertNotNull(restored);
                try (java.io.InputStream in = restored.createInputStream()) {
                    String xml =
                            new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
                    assertThat(xml).contains("XMP Title Two");
                }
            }
        }

        @Test
        @DisplayName("metadata extraction surfaces the XMP packet alongside info metadata")
        void metadataExtractionIncludesXmp() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractDocumentMetadata(pdfMultipart(pdfWithXmp("XMP Meta")), null, out);
            PdfJsonDocumentMetadata md =
                    objectMapper.readValue(out.toByteArray(), PdfJsonDocumentMetadata.class);
            assertThat(md.getXmpMetadata()).isNotBlank();
        }
    }

    // ==================================================================
    // Mixed JPEG + lossless images with transform variety
    // ==================================================================

    @Nested
    @DisplayName("mixed JPEG and lossless image placement")
    class MixedImagePlacement {

        @Test
        @DisplayName("an extracted JPEG and PNG pair both carry format and data")
        void extractedJpegAndPng() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            PDImageXObject jpeg =
                    JPEGFactory.createFromImage(
                            document, solidImage(40, 30, Color.RED, BufferedImage.TYPE_INT_RGB));
            PDImageXObject png =
                    LosslessFactory.createFromImage(
                            document, solidImage(30, 30, Color.BLUE, BufferedImage.TYPE_INT_RGB));
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.drawImage(jpeg, 60, 600, 100, 75);
                cs.drawImage(png, 220, 600, 75, 75);
            }
            PdfJsonDocument doc = toJsonDocument(toBytes(document));
            List<PdfJsonImageElement> images = doc.getPages().get(0).getImageElements();
            assertThat(images).hasSizeGreaterThanOrEqualTo(2);
            assertThat(images)
                    .anySatisfy(
                            img ->
                                    assertThat(img.getImageFormat().toLowerCase())
                                            .containsAnyOf("jpg", "jpeg"));
            assertThat(images).allSatisfy(img -> assertThat(img.getImageData()).isNotBlank());
        }

        @Test
        @DisplayName("explicit-transform JPEG and default-placement PNG render on one page")
        void transformVsDefaultPlacement() throws IOException {
            stubFallbackFont();
            PdfJsonImageElement transformed =
                    PdfJsonImageElement.builder()
                            .id("JpgT")
                            .imageData(
                                    jpgBase64(
                                            solidImage(
                                                    16, 16, Color.RED, BufferedImage.TYPE_INT_RGB)))
                            .imageFormat("jpg")
                            .transform(new float[] {72f, 0f, 0f, 54f, 90f, 560f})
                            .build();
            PdfJsonImageElement edgePlaced =
                    PdfJsonImageElement.builder()
                            .id("PngE")
                            .imageData(
                                    pngBase64(
                                            solidImage(
                                                    16,
                                                    16,
                                                    Color.BLUE,
                                                    BufferedImage.TYPE_INT_RGB)))
                            .imageFormat("png")
                            .x(260f)
                            .y(560f)
                            .width(64f)
                            .height(48f)
                            .build();
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .imageElements(new ArrayList<>(List.of(transformed, edgePlaced)))
                            .build();
            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(docWith(page)))) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getResources());
            }
        }

        @Test
        @DisplayName("a JPEG-bearing page round trips and keeps its image resources")
        void jpegPageRoundTrip() throws IOException {
            stubFallbackFont();
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            PDImageXObject jpeg =
                    JPEGFactory.createFromImage(
                            document, solidImage(48, 36, Color.ORANGE, BufferedImage.TYPE_INT_RGB));
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.drawImage(jpeg, 80, 500, 120, 90);
            }
            PdfJsonDocument doc = toJsonDocument(toBytes(document));
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getResources());
            }
        }
    }

    // ==================================================================
    // Cache / editor API: export edits, empty edits, out of range, clear
    // ==================================================================

    @Nested
    @DisplayName("cache export edits and lifecycle")
    class CacheExportEditsLifecycle {

        private byte[] twoPageTextPdf() throws IOException {
            PDDocument document = new PDDocument();
            for (int i = 0; i < 2; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                document.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                    cs.newLineAtOffset(72, 700);
                    cs.showText("Cache page " + (i + 1));
                    cs.endText();
                }
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("export changing font size and colour on a cached page re-saves the document")
        void exportChangesFontSizeAndColor() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            cacheLazyDocument("job-size-color", simpleTextPdf("Resize and recolour me"));

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-size-color", 1, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            page.setPageNumber(1);
            for (PdfJsonTextElement element : page.getTextElements()) {
                element.setFontSize(26f);
                element.setFillColor(
                        PdfJsonTextColor.builder()
                                .colorSpace("DeviceRGB")
                                .components(new float[] {0.2f, 0.6f, 0.9f})
                                .build());
            }
            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(new ArrayList<>(List.of(page)));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-size-color", updates, out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("export adding a text element to one cached page rebuilds both pages")
        void exportAddsTextElement() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            cacheLazyDocument("job-add-text", twoPageTextPdf());

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-add-text", 1, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            page.setPageNumber(1);
            List<PdfJsonTextElement> elements =
                    page.getTextElements() != null
                            ? new ArrayList<>(page.getTextElements())
                            : new ArrayList<>();
            elements.add(
                    PdfJsonTextElement.builder()
                            .text("Newly added line")
                            .fontId(elements.isEmpty() ? null : elements.get(0).getFontId())
                            .fontSize(12f)
                            .x(72f)
                            .y(640f)
                            .build());
            page.setTextElements(elements);

            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(new ArrayList<>(List.of(page)));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-add-text", updates, out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(2, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("export with an empty update document returns the cached PDF intact")
        void exportEmptyUpdatesReturnsCached() throws IOException {
            stubFallbackFont();
            cacheLazyDocument("job-empty-updates", twoPageTextPdf());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-empty-updates", new PdfJsonDocument(), out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(2, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("export of only an out-of-range page leaves the cached document unchanged")
        void exportOnlyOutOfRangePage() throws IOException {
            stubFallbackFont();
            cacheLazyDocument("job-only-ghost", twoPageTextPdf());
            PdfJsonPage ghost = new PdfJsonPage();
            ghost.setPageNumber(42);
            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(new ArrayList<>(List.of(ghost)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-only-ghost", updates, out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(2, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("extractSinglePage after clearCachedDocument throws CacheUnavailableException")
        void singlePageAfterClearThrows() throws IOException {
            cacheLazyDocument("job-clear-page", simpleTextPdf("Clear single page"));
            service.clearCachedDocument("job-clear-page");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    CacheUnavailableException.class,
                    () -> service.extractSinglePage("job-clear-page", 1, out));
        }

        @Test
        @DisplayName("clearCachedDocument is idempotent when called twice")
        void clearTwiceIsIdempotent() throws IOException {
            cacheLazyDocument("job-clear-twice", simpleTextPdf("Clear twice"));
            service.clearCachedDocument("job-clear-twice");
            assertDoesNotThrow(() -> service.clearCachedDocument("job-clear-twice"));
        }
    }

    // ==================================================================
    // Metadata extraction with and without a jobId
    // ==================================================================

    @Nested
    @DisplayName("metadata extraction with and without a jobId")
    class MetadataJobIdVariants {

        @Test
        @DisplayName("metadata extraction without a jobId does not populate the cache")
        void metadataNoJobIdSkipsCache() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractDocumentMetadata(
                    pdfMultipart(simpleTextPdf("No job id meta")), null, out);
            PdfJsonDocumentMetadata md =
                    objectMapper.readValue(out.toByteArray(), PdfJsonDocumentMetadata.class);
            assertThat(md.getPageDimensions()).hasSize(1);
            assertEquals(Boolean.TRUE, md.getLazyImages());
        }

        @Test
        @DisplayName(
                "metadata extraction with a jobId caches a page retrievable by extractSinglePage")
        void metadataWithJobIdCachesPage() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream metaOut = new ByteArrayOutputStream();
            service.extractDocumentMetadata(
                    pdfMultipart(simpleTextPdf("Job id meta")), "job-meta-cache", metaOut);

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-meta-cache", 1, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            assertEquals(1, page.getPageNumber());
        }
    }
}
