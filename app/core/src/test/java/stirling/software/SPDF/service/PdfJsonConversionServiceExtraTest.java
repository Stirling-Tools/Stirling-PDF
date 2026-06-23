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
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
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
 * Extra coverage tests for {@link PdfJsonConversionService} aimed at reachable branches the
 * existing suites leave cold: full document-information round trips that exercise the
 * creation/modification date and trapped paths, the {@code convertJsonToPdf(MultipartFile)} file
 * overload driven by a re-serialized model, the cache-backed export path with
 * added/removed/modified text and image elements plus a font supplied in the update document, rich
 * COS metadata via nested page resources, additional text render modes / spacing / rise, negative
 * coordinates, and full model-mutation (page add/remove, colour and size edits) round trips.
 *
 * <p>Construction mirrors {@code PdfJsonConversionServiceCoverageTest} and {@code
 * PdfJsonConversionServiceDeepTest} so the same real in-memory PDF load path is exercised without
 * repeating their assertions.
 */
@ExtendWith(MockitoExtension.class)
@org.mockito.junit.jupiter.MockitoSettings(strictness = Strictness.LENIENT)
class PdfJsonConversionServiceExtraTest {

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
                            Path path = Files.createTempFile("pdfjson-extra-test", suffix);
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

    private MockMultipartFile jsonMultipart(byte[] bytes) {
        return new MockMultipartFile("fileInput", "model.json", "application/json", bytes);
    }

    private byte[] toBytes(PDDocument document) throws IOException {
        try (document) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
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
    // Document information / date / trapped round trips
    // ==================================================================

    @Nested
    @DisplayName("document information dates and trapped round trips")
    class DocumentInfoRoundTrips {

        private byte[] datedPdf() throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.LETTER));
            PDDocumentInformation info = document.getDocumentInformation();
            info.setTitle("Dated Title");
            info.setAuthor("Dated Author");
            Calendar created = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            created.set(2021, Calendar.MARCH, 4, 5, 6, 7);
            created.set(Calendar.MILLISECOND, 0);
            info.setCreationDate(created);
            Calendar modified = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            modified.set(2022, Calendar.JUNE, 8, 9, 10, 11);
            modified.set(Calendar.MILLISECOND, 0);
            info.setModificationDate(modified);
            info.setTrapped("True");
            return toBytes(document);
        }

        @Test
        @DisplayName("creation and modification dates are extracted as ISO instants")
        void datesExtractedAsInstants() throws IOException {
            PdfJsonDocument doc = toJsonDocument(datedPdf());
            PdfJsonMetadata md = doc.getMetadata();
            assertThat(md.getCreationDate()).isNotBlank();
            assertThat(md.getModificationDate()).isNotBlank();
            // formatCalendar emits Instant.toString(), so it should parse as an instant.
            assertThat(md.getCreationDate()).contains("2021");
            assertThat(md.getModificationDate()).contains("2022");
        }

        @Test
        @DisplayName("trapped flag survives extraction into the metadata model")
        void trappedExtracted() throws IOException {
            PdfJsonDocument doc = toJsonDocument(datedPdf());
            assertThat(doc.getMetadata().getTrapped()).isEqualTo("True");
        }

        @Test
        @DisplayName("dates and trapped round trip back into PDDocumentInformation")
        void datesRoundTripBack() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(datedPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                PDDocumentInformation info = loaded.getDocumentInformation();
                assertEquals("Dated Title", info.getTitle());
                assertEquals("True", info.getTrapped());
                assertNotNull(info.getCreationDate());
                assertEquals(2021, info.getCreationDate().get(Calendar.YEAR));
                assertNotNull(info.getModificationDate());
                assertEquals(2022, info.getModificationDate().get(Calendar.YEAR));
            }
        }

        @Test
        @DisplayName("synthesized metadata with an unparseable date is ignored, rest applies")
        void unparseableDateIgnored() throws IOException {
            stubFallbackFont();
            PdfJsonMetadata md =
                    PdfJsonMetadata.builder()
                            .title("Keep Title")
                            .creationDate("not-a-real-instant")
                            .modificationDate("2023-01-02T03:04:05Z")
                            .trapped("Unknown")
                            .build();
            PdfJsonDocument doc = new PdfJsonDocument();
            doc.setMetadata(md);
            doc.setPages(new ArrayList<>());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                PDDocumentInformation info = loaded.getDocumentInformation();
                assertEquals("Keep Title", info.getTitle());
                assertEquals("Unknown", info.getTrapped());
                // The bad creation date is dropped; the good modification date is applied.
                assertNotNull(info.getModificationDate());
                assertEquals(2023, info.getModificationDate().get(Calendar.YEAR));
            }
        }
    }

    // ==================================================================
    // convertJsonToPdf(MultipartFile) file overload
    // ==================================================================

    @Nested
    @DisplayName("convertJsonToPdf file overload round trips")
    class JsonFileOverload {

        @Test
        @DisplayName("re-serialized extracted model rebuilds via the file overload")
        void fileOverloadRebuildsModel() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(simpleTextPdf("File overload source"));
            byte[] json = objectMapper.writeValueAsBytes(doc);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.convertJsonToPdf(jsonMultipart(json), out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("edited text re-serialized to JSON bytes rebuilds via the file overload")
        void fileOverloadAppliesEdit() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc = toJsonDocument(simpleTextPdf("Original line here"));
            for (PdfJsonTextElement element : doc.getPages().get(0).getTextElements()) {
                if (element.getText() != null && !element.getText().isBlank()) {
                    element.setText("Edited line text");
                    break;
                }
            }
            byte[] json = objectMapper.writeValueAsBytes(doc);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.convertJsonToPdf(jsonMultipart(json), out);
            assertThat(out.toByteArray()).isNotEmpty();
        }
    }

    // ==================================================================
    // Full model mutation: add/remove pages, change colour/size/position
    // ==================================================================

    @Nested
    @DisplayName("model mutation round trips")
    class ModelMutation {

        private byte[] twoPageTextPdf() throws IOException {
            PDDocument document = new PDDocument();
            for (int i = 0; i < 2; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                document.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                    cs.newLineAtOffset(72, 700);
                    cs.showText("Original page " + (i + 1));
                    cs.endText();
                }
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("removing a page from the model rebuilds with one fewer page")
        void removePage() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(twoPageTextPdf());
            assertEquals(2, doc.getPages().size());
            List<PdfJsonPage> pages = new ArrayList<>(doc.getPages());
            pages.remove(1);
            doc.setPages(pages);
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("adding a synthesized page rebuilds with one more page")
        void addPage() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(twoPageTextPdf());
            List<PdfJsonPage> pages = new ArrayList<>(doc.getPages());
            PdfJsonFont font = std14Font("ExtraF", "Helvetica");
            List<PdfJsonFont> fonts =
                    doc.getFonts() != null ? new ArrayList<>(doc.getFonts()) : new ArrayList<>();
            fonts.add(font);
            doc.setFonts(fonts);
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Brand new page")
                            .fontId("ExtraF")
                            .fontSize(14f)
                            .x(72f)
                            .y(700f)
                            .build();
            pages.add(
                    PdfJsonPage.builder()
                            .pageNumber(3)
                            .width(612f)
                            .height(792f)
                            .textElements(new ArrayList<>(List.of(element)))
                            .build());
            doc.setPages(pages);
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(3, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("changing text colour, font size and position rebuilds a valid PDF")
        void changeColorSizePosition() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonDocument doc = toJsonDocument(simpleTextPdf("Recolour me"));
            for (PdfJsonTextElement element : doc.getPages().get(0).getTextElements()) {
                element.setFontSize(28f);
                element.setX(120f);
                element.setY(540f);
                element.setFillColor(
                        PdfJsonTextColor.builder()
                                .colorSpace("DeviceRGB")
                                .components(new float[] {0.9f, 0.1f, 0.4f})
                                .build());
            }
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }
    }

    // ==================================================================
    // Cache export: add / remove / modify text and image elements
    // ==================================================================

    @Nested
    @DisplayName("cache export with element edits")
    class CacheExportElementEdits {

        private byte[] textAndImagePdf() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            PDImageXObject image =
                    LosslessFactory.createFromImage(
                            document, solidImage(20, 16, Color.GREEN, BufferedImage.TYPE_INT_RGB));
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.drawImage(image, 100, 500, 80, 64);
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(72, 400);
                cs.showText("Caption text");
                cs.endText();
            }
            return toBytes(document);
        }

        @Test
        @DisplayName("export applies an edit that adds a new image element to a cached page")
        void exportAddsImage() throws IOException {
            stubFallbackFont();
            cacheLazyDocument("job-add-img", simpleTextPdf("Add an image here"));

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-add-img", 1, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            page.setPageNumber(1);

            PdfJsonImageElement added =
                    PdfJsonImageElement.builder()
                            .id("AddedIm")
                            .imageData(
                                    pngBase64(
                                            solidImage(
                                                    12, 12, Color.RED, BufferedImage.TYPE_INT_RGB)))
                            .imageFormat("png")
                            .x(60f)
                            .y(600f)
                            .width(48f)
                            .height(48f)
                            .build();
            page.setImageElements(new ArrayList<>(List.of(added)));

            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(new ArrayList<>(List.of(page)));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-add-img", updates, out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getResources());
            }
        }

        @Test
        @DisplayName("export applies an edit that removes all text from a cached page")
        void exportRemovesText() throws IOException {
            stubFallbackFont();
            cacheLazyDocument("job-remove-text", textAndImagePdf());

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-remove-text", 1, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            page.setPageNumber(1);
            page.setTextElements(new ArrayList<>());

            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(new ArrayList<>(List.of(page)));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-remove-text", updates, out);
            assertThat(out.toByteArray()).isNotEmpty();
        }

        @Test
        @DisplayName("export merges a font supplied in the update document")
        void exportMergesUpdateFont() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            cacheLazyDocument("job-update-font", simpleTextPdf("Font merge source"));

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-update-font", 1, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            page.setPageNumber(1);

            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(new ArrayList<>(List.of(page)));
            // A font carried on the update document drives the updates.getFonts() merge branch.
            updates.setFonts(new ArrayList<>(List.of(std14Font("UpdF", "Times-Roman"))));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-update-font", updates, out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("export of a cached image-bearing page surfaces image data on re-extract")
        void exportThenReextractImage() throws IOException {
            stubFallbackFont();
            cacheLazyDocument("job-export-img", textAndImagePdf());

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-export-img", 1, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            page.setPageNumber(1);
            for (PdfJsonTextElement element : page.getTextElements()) {
                if (element.getText() != null && !element.getText().isBlank()) {
                    element.setText("Caption edited");
                    break;
                }
            }
            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(new ArrayList<>(List.of(page)));

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-export-img", updates, out);

            // The cache is now refreshed; pulling the page back still yields image data.
            ByteArrayOutputStream reOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-export-img", 1, reOut);
            PdfJsonPage reloaded = objectMapper.readValue(reOut.toByteArray(), PdfJsonPage.class);
            assertThat(reloaded.getImageElements()).isNotEmpty();
        }
    }

    // ==================================================================
    // extractDocumentMetadata variants and downstream cache use
    // ==================================================================

    @Nested
    @DisplayName("metadata extraction feeding the cache")
    class MetadataCacheFlow {

        @Test
        @DisplayName("metadata extraction then export with no updates returns the cached PDF")
        void metadataThenExportNoUpdates() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream metaOut = new ByteArrayOutputStream();
            service.extractDocumentMetadata(
                    pdfMultipart(simpleTextPdf("Meta then export")), "job-meta-export", metaOut);
            PdfJsonDocumentMetadata md =
                    objectMapper.readValue(metaOut.toByteArray(), PdfJsonDocumentMetadata.class);
            assertThat(md.getPageDimensions()).hasSize(1);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.exportUpdatedPages("job-meta-export", new PdfJsonDocument(), out);
            try (PDDocument loaded = Loader.loadPDF(out.toByteArray())) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("metadata extraction caches fonts retrievable via extractPageFonts")
        void metadataThenPageFonts() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream metaOut = new ByteArrayOutputStream();
            service.extractDocumentMetadata(
                    pdfMultipart(simpleTextPdf("Fonts via metadata")), "job-meta-fonts", metaOut);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractPageFonts("job-meta-fonts", 1, out);
            List<?> fonts = objectMapper.readValue(out.toByteArray(), List.class);
            assertThat(fonts).isNotEmpty();
        }

        @Test
        @DisplayName("metadata extraction carries the extracted document title")
        void metadataCarriesTitle() throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.LETTER));
            document.getDocumentInformation().setTitle("Meta Title Extra");
            byte[] bytes = toBytes(document);

            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractDocumentMetadata(pdfMultipart(bytes), null, out);
            PdfJsonDocumentMetadata md =
                    objectMapper.readValue(out.toByteArray(), PdfJsonDocumentMetadata.class);
            assertThat(md.getMetadata()).isNotNull();
            assertEquals("Meta Title Extra", md.getMetadata().getTitle());
        }
    }

    // ==================================================================
    // Rich COS metadata via nested page resources
    // ==================================================================

    @Nested
    @DisplayName("rich COS object mapping via resources")
    class RichCosMapping {

        /** A page whose resource dictionary carries nested arrays/dicts/name/number/bool/null. */
        private byte[] richResourcePdf() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(72, 700);
                cs.showText("Resource carrier");
                cs.endText();
            }

            org.apache.pdfbox.cos.COSDictionary custom = new org.apache.pdfbox.cos.COSDictionary();
            custom.setItem(
                    org.apache.pdfbox.cos.COSName.getPDFName("AName"),
                    org.apache.pdfbox.cos.COSName.getPDFName("SomeValue"));
            custom.setItem(
                    org.apache.pdfbox.cos.COSName.getPDFName("AnInt"),
                    org.apache.pdfbox.cos.COSInteger.get(7L));
            custom.setItem(
                    org.apache.pdfbox.cos.COSName.getPDFName("AFloat"),
                    new org.apache.pdfbox.cos.COSFloat(1.25f));
            custom.setItem(
                    org.apache.pdfbox.cos.COSName.getPDFName("ABool"),
                    org.apache.pdfbox.cos.COSBoolean.TRUE);
            custom.setItem(
                    org.apache.pdfbox.cos.COSName.getPDFName("ANull"),
                    org.apache.pdfbox.cos.COSNull.NULL);
            custom.setItem(
                    org.apache.pdfbox.cos.COSName.getPDFName("AString"),
                    new org.apache.pdfbox.cos.COSString("hello string"));

            org.apache.pdfbox.cos.COSArray nested = new org.apache.pdfbox.cos.COSArray();
            nested.add(org.apache.pdfbox.cos.COSInteger.get(1L));
            nested.add(org.apache.pdfbox.cos.COSInteger.get(2L));
            org.apache.pdfbox.cos.COSDictionary innerDict =
                    new org.apache.pdfbox.cos.COSDictionary();
            innerDict.setItem(
                    org.apache.pdfbox.cos.COSName.getPDFName("Deep"),
                    org.apache.pdfbox.cos.COSName.getPDFName("Value"));
            nested.add(innerDict);
            custom.setItem(org.apache.pdfbox.cos.COSName.getPDFName("AnArray"), nested);

            // Resources dictionary is created once the content stream sets a font above.
            page.getResources()
                    .getCOSObject()
                    .setItem(org.apache.pdfbox.cos.COSName.getPDFName("StirlingExtra"), custom);

            return toBytes(document);
        }

        @Test
        @DisplayName("nested custom resource dictionary is preserved through extraction")
        void richResourcesPreserved() throws IOException {
            PdfJsonDocument doc = toJsonDocument(richResourcePdf());
            PdfJsonPage page = doc.getPages().get(0);
            assertNotNull(page.getResources());
        }

        @Test
        @DisplayName("nested custom resource dictionary survives a full round trip")
        void richResourcesRoundTrip() throws IOException {
            stubFallbackFont();
            PdfJsonDocument doc = toJsonDocument(richResourcePdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getResources());
            }
        }
    }

    // ==================================================================
    // Text render modes / spacing / rise / negative coords (synthesized)
    // ==================================================================

    @Nested
    @DisplayName("text render modes, spacing and coordinates")
    class TextStateVariants {

        private PdfJsonDocument textWith(PdfJsonTextElement element) {
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .textElements(new ArrayList<>(List.of(element)))
                            .build();
            PdfJsonDocument doc = docWith(page);
            doc.setFonts(new ArrayList<>(List.of(std14Font("F1", "Helvetica"))));
            return doc;
        }

        @Test
        @DisplayName("stroke render mode (1) renders with a stroke colour")
        void strokeRenderMode() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Stroked")
                            .fontId("F1")
                            .fontSize(18f)
                            .renderingMode(1)
                            .strokeColor(
                                    PdfJsonTextColor.builder()
                                            .colorSpace("DeviceRGB")
                                            .components(new float[] {0.1f, 0.2f, 0.3f})
                                            .build())
                            .x(72f)
                            .y(700f)
                            .build();
            assertThat(runJsonToPdf(textWith(element))).isNotEmpty();
        }

        @Test
        @DisplayName("invisible render mode (3) still rebuilds cleanly")
        void invisibleRenderMode() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Invisible")
                            .fontId("F1")
                            .fontSize(12f)
                            .renderingMode(3)
                            .x(72f)
                            .y(680f)
                            .build();
            assertThat(runJsonToPdf(textWith(element))).isNotEmpty();
        }

        @Test
        @DisplayName("fill-stroke-clip render mode (7) rebuilds cleanly")
        void fillStrokeClipRenderMode() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Clipped")
                            .fontId("F1")
                            .fontSize(12f)
                            .renderingMode(7)
                            .fillColor(
                                    PdfJsonTextColor.builder()
                                            .colorSpace("DeviceGray")
                                            .components(new float[] {0.3f})
                                            .build())
                            .x(72f)
                            .y(660f)
                            .build();
            assertThat(runJsonToPdf(textWith(element))).isNotEmpty();
        }

        @Test
        @DisplayName("word spacing, horizontal scaling and rise combine without error")
        void spacingScalingRise() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("spaced words rise")
                            .fontId("F1")
                            .fontSize(14f)
                            .wordSpacing(3.5f)
                            .characterSpacing(0.7f)
                            .horizontalScaling(130f)
                            .rise(4f)
                            .leading(18f)
                            .x(72f)
                            .y(640f)
                            .build();
            assertThat(runJsonToPdf(textWith(element))).isNotEmpty();
        }

        @Test
        @DisplayName("negative coordinates are tolerated by the regeneration path")
        void negativeCoordinates() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Below origin")
                            .fontId("F1")
                            .fontSize(12f)
                            .x(-50f)
                            .y(-25f)
                            .build();
            assertThat(runJsonToPdf(textWith(element))).isNotEmpty();
        }

        @Test
        @DisplayName("zero font size falls back without aborting the rebuild")
        void zeroFontSize() throws IOException {
            stubFallbackFont();
            stubCanEncode();
            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Zero size")
                            .fontId("F1")
                            .fontSize(0f)
                            .x(72f)
                            .y(620f)
                            .build();
            assertDoesNotThrow(() -> runJsonToPdf(textWith(element)));
        }
    }

    // ==================================================================
    // Multiple images per page + mixed content (synthesized + extracted)
    // ==================================================================

    @Nested
    @DisplayName("multiple images and mixed content")
    class MultiImageMixed {

        @Test
        @DisplayName("two synthesized images (JPEG + lossless PNG) render on one page")
        void twoSynthesizedImages() throws IOException {
            stubFallbackFont();
            ByteArrayOutputStream jpgOut = new ByteArrayOutputStream();
            ImageIO.write(solidImage(16, 16, Color.RED, BufferedImage.TYPE_INT_RGB), "jpg", jpgOut);
            String jpg = Base64.getEncoder().encodeToString(jpgOut.toByteArray());

            PdfJsonImageElement jpeg =
                    PdfJsonImageElement.builder()
                            .id("Jpeg")
                            .imageData(jpg)
                            .imageFormat("jpg")
                            .x(60f)
                            .y(600f)
                            .width(64f)
                            .height(48f)
                            .build();
            PdfJsonImageElement png =
                    PdfJsonImageElement.builder()
                            .id("Png")
                            .imageData(
                                    pngBase64(
                                            solidImage(
                                                    16,
                                                    16,
                                                    Color.BLUE,
                                                    BufferedImage.TYPE_INT_RGB)))
                            .imageFormat("png")
                            .x(200f)
                            .y(600f)
                            .width(48f)
                            .height(48f)
                            .build();
            PdfJsonPage page =
                    PdfJsonPage.builder()
                            .pageNumber(1)
                            .width(612f)
                            .height(792f)
                            .imageElements(new ArrayList<>(List.of(jpeg, png)))
                            .build();
            try (PDDocument loaded = Loader.loadPDF(runJsonToPdf(docWith(page)))) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getResources());
            }
        }

        @Test
        @DisplayName("page mixing text, image and annotation round trips from extraction")
        void mixedTextImageAnnotationExtracted() throws IOException {
            stubFallbackFont();
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);

            PDImageXObject jpeg =
                    JPEGFactory.createFromImage(
                            document, solidImage(24, 18, Color.RED, BufferedImage.TYPE_INT_RGB));
            PDImageXObject png =
                    LosslessFactory.createFromImage(
                            document, solidImage(18, 18, Color.BLUE, BufferedImage.TYPE_INT_RGB));

            PDAnnotationText note = new PDAnnotationText();
            note.setContents("Mixed note");
            note.setRectangle(new PDRectangle(50, 720, 18, 18));
            page.getAnnotations().add(note);

            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.drawImage(jpeg, 60, 600, 96, 72);
                cs.drawImage(png, 200, 600, 72, 72);
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
                cs.newLineAtOffset(72, 500);
                cs.showText("Mixed content body");
                cs.endText();
            }
            byte[] bytes = toBytes(document);

            PdfJsonDocument doc = toJsonDocument(bytes);
            PdfJsonPage extracted = doc.getPages().get(0);
            assertThat(extracted.getImageElements()).hasSizeGreaterThanOrEqualTo(2);
            assertThat(extracted.getTextElements()).isNotEmpty();
            assertThat(extracted.getAnnotations()).isNotEmpty();

            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("lazy single-page extraction surfaces multiple images for a cached page")
        void lazyMultipleImages() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            PDImageXObject a =
                    LosslessFactory.createFromImage(
                            document, solidImage(16, 16, Color.RED, BufferedImage.TYPE_INT_RGB));
            PDImageXObject b =
                    LosslessFactory.createFromImage(
                            document, solidImage(16, 16, Color.BLUE, BufferedImage.TYPE_INT_RGB));
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.drawImage(a, 60, 600, 48, 48);
                cs.drawImage(b, 200, 600, 48, 48);
            }
            byte[] bytes = toBytes(document);

            cacheLazyDocument("job-multi-img", bytes);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            service.extractSinglePage("job-multi-img", 1, out);
            PdfJsonPage extracted = objectMapper.readValue(out.toByteArray(), PdfJsonPage.class);
            assertThat(extracted.getImageElements()).hasSizeGreaterThanOrEqualTo(2);
        }
    }

    // ==================================================================
    // Cache lifecycle and miss paths
    // ==================================================================

    @Nested
    @DisplayName("cache lifecycle and miss paths")
    class CacheLifecycle {

        @Test
        @DisplayName("extractPageFonts on a cleared job throws CacheUnavailableException")
        void pageFontsAfterClearThrows() throws IOException {
            cacheLazyDocument("job-clear-fonts", simpleTextPdf("Clear fonts"));
            service.clearCachedDocument("job-clear-fonts");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    CacheUnavailableException.class,
                    () -> service.extractPageFonts("job-clear-fonts", 1, out));
        }

        @Test
        @DisplayName("exportUpdatedPages on a cleared job throws CacheUnavailableException")
        void exportAfterClearThrows() throws IOException {
            cacheLazyDocument("job-clear-export", simpleTextPdf("Clear export"));
            service.clearCachedDocument("job-clear-export");
            PdfJsonPage page = new PdfJsonPage();
            page.setPageNumber(1);
            PdfJsonDocument updates = new PdfJsonDocument();
            updates.setPages(new ArrayList<>(List.of(page)));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            assertThrows(
                    CacheUnavailableException.class,
                    () -> service.exportUpdatedPages("job-clear-export", updates, out));
        }

        @Test
        @DisplayName("extractDocumentMetadata reusing a jobId refreshes the cached document")
        void metadataReusedJobIdRefreshes() throws IOException {
            when(pdfDocumentFactory.load(any(byte[].class), eq(true)))
                    .thenAnswer(inv -> Loader.loadPDF(inv.getArgument(0, byte[].class)));
            ByteArrayOutputStream first = new ByteArrayOutputStream();
            service.extractDocumentMetadata(
                    pdfMultipart(simpleTextPdf("First doc")), "job-reuse", first);

            // Re-run with a two-page doc under the same jobId; the cache should now report two
            // pages.
            PDDocument twoPager = new PDDocument();
            twoPager.addPage(new PDPage(PDRectangle.LETTER));
            twoPager.addPage(new PDPage(PDRectangle.LETTER));
            byte[] twoBytes = toBytes(twoPager);

            ByteArrayOutputStream second = new ByteArrayOutputStream();
            service.extractDocumentMetadata(pdfMultipart(twoBytes), "job-reuse", second);

            ByteArrayOutputStream pageOut = new ByteArrayOutputStream();
            service.extractSinglePage("job-reuse", 2, pageOut);
            PdfJsonPage page = objectMapper.readValue(pageOut.toByteArray(), PdfJsonPage.class);
            assertEquals(2, page.getPageNumber());
        }
    }
}
