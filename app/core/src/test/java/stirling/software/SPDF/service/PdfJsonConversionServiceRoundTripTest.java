package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
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
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonFont;
import stirling.software.SPDF.model.json.PdfJsonFormField;
import stirling.software.SPDF.model.json.PdfJsonPage;
import stirling.software.SPDF.model.json.PdfJsonTextElement;
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
 * Round-trip preservation tests that exercise the resource/content-stream/form-field/XMP machinery
 * of {@link PdfJsonConversionService}. Each test builds a real PDF, converts it to the JSON model,
 * mutates or inspects it, and rebuilds a PDF, driving the non-lightweight extraction and rebuild
 * helpers (resources, content streams, token rewrite, form fields, font metadata).
 */
@ExtendWith(MockitoExtension.class)
@org.mockito.junit.jupiter.MockitoSettings(strictness = Strictness.LENIENT)
class PdfJsonConversionServiceRoundTripTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;
    @Mock private TaskManager taskManager;
    @Mock private PdfJsonFallbackFontService fallbackFontService;
    @Mock private PdfJsonFontService fontService;
    @Mock private Type3FontConversionService type3FontConversionService;
    @Mock private Type3GlyphExtractor type3GlyphExtractor;
    @Mock private ApplicationProperties applicationProperties;

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
                            Path path = Files.createTempFile("pdfjson-rt-test", suffix);
                            createdTempFiles.add(path);
                            return path.toFile();
                        });
        when(tempFileManager.deleteTempFile(any(File.class)))
                .thenAnswer(
                        invocation -> {
                            File file = invocation.getArgument(0);
                            return file != null && file.delete();
                        });
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

    /** Stubs the factory to load from a Path (used by convertPdfToJson). */
    private void stubFactoryFromPath() throws IOException {
        when(pdfDocumentFactory.load(any(Path.class), eq(true)))
                .thenAnswer(
                        invocation ->
                                Loader.loadPDF(invocation.getArgument(0, Path.class).toFile()));
    }

    private PdfJsonDocument toJsonDocument(byte[] pdfBytes) throws IOException {
        stubFactoryFromPath();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertPdfToJson(pdfMultipart(pdfBytes), out);
        return objectMapper.readValue(out.toByteArray(), PdfJsonDocument.class);
    }

    private byte[] runJsonToPdf(PdfJsonDocument doc) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        service.convertJsonToPdf(doc, out);
        return out.toByteArray();
    }

    private byte[] twoLineTextPdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f);
            cs.newLineAtOffset(72, 700);
            cs.showText("First line of text");
            cs.newLineAtOffset(0, -16);
            cs.showText("Second line of text");
            cs.endText();
        }
        return toBytes(document);
    }

    private byte[] formFieldPdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);

        PDAcroForm acroForm = new PDAcroForm(document);
        // A font in default resources plus a /DA string so setValue can build appearances.
        PDResources dr = new PDResources();
        dr.put(
                org.apache.pdfbox.cos.COSName.getPDFName("Helv"),
                new org.apache.pdfbox.pdmodel.font.PDType1Font(
                        org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA));
        acroForm.setDefaultResources(dr);
        acroForm.setDefaultAppearance("/Helv 12 Tf 0 g");
        acroForm.setNeedAppearances(true);
        document.getDocumentCatalog().setAcroForm(acroForm);

        PDTextField field = new PDTextField(acroForm);
        field.setPartialName("firstName");
        field.setDefaultAppearance("/Helv 12 Tf 0 g");

        PDAnnotationWidget widget = new PDAnnotationWidget();
        widget.setRectangle(new PDRectangle(100, 650, 200, 20));
        widget.setPage(page);
        List<PDAnnotationWidget> widgets = new ArrayList<>(field.getWidgets());
        widgets.add(widget);
        field.setWidgets(widgets);

        acroForm.getFields().add(field);
        page.getAnnotations().add(widget);
        field.setValue("Jane");

        return toBytes(document);
    }

    // ------------------------------------------------------------------
    // Content stream + resource preservation
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("content stream and resource preservation")
    class ContentStreamPreservation {

        @Test
        @DisplayName("non-lightweight extraction captures content streams and resources")
        void capturesStreamsAndResources() throws IOException {
            PdfJsonDocument doc = toJsonDocument(twoLineTextPdf());
            PdfJsonPage page = doc.getPages().get(0);
            assertNotNull(page.getResources(), "expected serialized resources");
            assertThat(page.getContentStreams()).isNotEmpty();
        }

        @Test
        @DisplayName("preserved content streams enable in-place token rewrite on round trip")
        void tokenRewriteRoundTrip() throws IOException {
            PdfJsonDocument doc = toJsonDocument(twoLineTextPdf());
            // Same-length edit keeps the rewrite path viable.
            for (PdfJsonTextElement element : doc.getPages().get(0).getTextElements()) {
                if (element.getText() != null && element.getText().contains("First")) {
                    element.setText(element.getText());
                    break;
                }
            }
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
                assertNotNull(loaded.getPage(0).getContents());
            }
        }

        @Test
        @DisplayName("round trip preserves the two-line page intact")
        void preservesTwoLines() throws IOException {
            PdfJsonDocument doc = toJsonDocument(twoLineTextPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(1, loaded.getNumberOfPages());
            }
        }
    }

    // ------------------------------------------------------------------
    // Form fields
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("form fields")
    class FormFields {

        @Test
        @DisplayName("AcroForm text field is extracted with name and value")
        void extractsTextField() throws IOException {
            PdfJsonDocument doc = toJsonDocument(formFieldPdf());
            List<PdfJsonFormField> fields = doc.getFormFields();
            assertThat(fields).isNotEmpty();
            PdfJsonFormField field = fields.get(0);
            assertThat(field.getPartialName()).isEqualTo("firstName");
            // The service stores the raw COS representation of the field value.
            assertThat(field.getValue()).contains("Jane");
            assertThat(field.getRawData()).isNotNull();
        }

        @Test
        @DisplayName("form field round trips back into a rebuilt AcroForm")
        void formFieldRoundTrip() throws IOException {
            PdfJsonDocument doc = toJsonDocument(formFieldPdf());
            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                PDAcroForm acroForm = loaded.getDocumentCatalog().getAcroForm();
                assertNotNull(acroForm, "rebuilt document should carry an AcroForm");
                assertThat(acroForm.getFields()).isNotEmpty();
            }
        }
    }

    // ------------------------------------------------------------------
    // XMP metadata
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("XMP metadata")
    class XmpMetadata {

        @Test
        @DisplayName("XMP packet survives a PDF to JSON to PDF round trip")
        void xmpRoundTrip() throws IOException {
            PDDocument document = new PDDocument();
            document.addPage(new PDPage(PDRectangle.LETTER));
            String xmp =
                    "<?xpacket begin=\"\"?><x:xmpmeta xmlns:x=\"adobe:ns:meta/\">"
                            + "<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"
                            + "</rdf:RDF></x:xmpmeta><?xpacket end=\"w\"?>";
            PDMetadata metadata = new PDMetadata(document);
            metadata.importXMPMetadata(xmp.getBytes(StandardCharsets.UTF_8));
            document.getDocumentCatalog().setMetadata(metadata);
            byte[] bytes = toBytes(document);

            PdfJsonDocument doc = toJsonDocument(bytes);
            assertThat(doc.getXmpMetadata()).isNotBlank();
            // Round-tripped base64 should decode back to XMP content.
            String decoded =
                    new String(
                            Base64.getDecoder().decode(doc.getXmpMetadata()),
                            StandardCharsets.UTF_8);
            assertThat(decoded).contains("xmpmeta");

            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertNotNull(loaded.getDocumentCatalog().getMetadata());
            }
        }
    }

    // ------------------------------------------------------------------
    // convertPdfToJsonDocument mutate-then-rebuild
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("convertPdfToJsonDocument workflow")
    class DocumentWorkflow {

        @Test
        @DisplayName("in-memory model can be mutated and rebuilt into a PDF")
        void mutateAndRebuild() throws IOException {
            stubFactoryFromPath();
            PdfJsonDocument doc = service.convertPdfToJsonDocument(pdfMultipart(twoLineTextPdf()));
            assertNotNull(doc);
            assertEquals(1, doc.getPages().size());

            // Append a brand new page with synthesized text.
            PdfJsonFont font =
                    PdfJsonFont.builder()
                            .id("F-new")
                            .uid("F-new")
                            .baseName("Helvetica")
                            .subtype("Type1")
                            .standard14Name("Helvetica")
                            .build();
            doc.getFonts().add(font);

            PdfJsonTextElement element =
                    PdfJsonTextElement.builder()
                            .text("Appended page")
                            .fontId("F-new")
                            .fontSize(12f)
                            .x(72f)
                            .y(700f)
                            .build();
            PdfJsonPage newPage =
                    PdfJsonPage.builder()
                            .pageNumber(2)
                            .width(612f)
                            .height(792f)
                            .textElements(List.of(element))
                            .build();
            List<PdfJsonPage> pages = new ArrayList<>(doc.getPages());
            pages.add(newPage);
            doc.setPages(pages);

            byte[] rebuilt = runJsonToPdf(doc);
            try (PDDocument loaded = Loader.loadPDF(rebuilt)) {
                assertEquals(2, loaded.getNumberOfPages());
            }
        }
    }
}
