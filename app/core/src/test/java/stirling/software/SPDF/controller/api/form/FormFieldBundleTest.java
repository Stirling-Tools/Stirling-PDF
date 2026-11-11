package stirling.software.SPDF.controller.api.form;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDNonTerminalField;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.FormFieldWithCoordinates;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Drives ?includeFields=true across a spread of real form shapes, checking the bundled list stays
 * interchangeable with the follow-up request it exists to remove.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("edit-fields field bundle")
class FormFieldBundleTest {

    /** Set to a directory to dump the produced archives for the frontend reader's fixtures. */
    private static final String FIXTURE_DIR = System.getProperty("bundle.fixtures");

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private FormFillController controller;

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            File file =
                                    Files.createTempFile(
                                                    "bundle", invocation.<String>getArgument(0))
                                            .toFile();
                            TempFile temp = mock(TempFile.class);
                            lenient().when(temp.getFile()).thenReturn(file);
                            lenient().when(temp.getPath()).thenReturn(file.toPath());
                            return temp;
                        });
        objectMapper = JsonMapper.builder().build();
        var field = FormFillController.class.getDeclaredField("objectMapper");
        field.setAccessible(true);
        field.set(controller, objectMapper);
    }

    // -- document shapes ----------------------------------------------

    private record Style(
            String name, int pages, int rotation, List<FormUtils.NewFormFieldDefinition> fields) {}

    private static FormUtils.NewFormFieldDefinition field(
            String name, String type, int page, float y, List<String> options) {
        return new FormUtils.NewFormFieldDefinition(
                name, null, type, page, 50f, y, 200f, 20f, null, null, options, null, null, null,
                null, null, null, null);
    }

    static List<Style> styles() {
        List<Style> styles = new ArrayList<>();
        styles.add(new Style("text-only", 1, 0, List.of(field("fullName", "text", 0, 700f, null))));
        styles.add(
                new Style(
                        "checkbox-and-radio",
                        1,
                        0,
                        List.of(
                                field("agree", "checkbox", 0, 700f, null),
                                field("plan", "radio", 0, 650f, List.of("basic", "pro")))));
        styles.add(
                new Style(
                        "choice-widgets",
                        1,
                        0,
                        List.of(
                                field("country", "dropdown", 0, 700f, List.of("UK", "IE", "FR")),
                                field("tags", "listbox", 0, 640f, List.of("a", "b", "c")))));
        styles.add(
                new Style(
                        "signature", 1, 0, List.of(field("approval", "signature", 0, 700f, null))));
        styles.add(
                new Style(
                        "multi-page",
                        3,
                        0,
                        List.of(
                                field("p1", "text", 0, 700f, null),
                                field("p2", "text", 1, 700f, null),
                                field("p3", "text", 2, 700f, null))));
        styles.add(new Style("rotated-90", 1, 90, List.of(field("rot", "text", 0, 700f, null))));
        styles.add(new Style("rotated-270", 1, 270, List.of(field("rot", "text", 0, 700f, null))));
        styles.add(
                new Style(
                        "unicode-names",
                        1,
                        0,
                        List.of(
                                field("nom_complet", "text", 0, 700f, null),
                                field("adresse postale", "text", 0, 660f, null))));

        List<FormUtils.NewFormFieldDefinition> many = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            many.add(
                    field(
                            "field_" + i,
                            i % 3 == 0 ? "checkbox" : "text",
                            i / 40,
                            740f - (i % 40) * 18f,
                            null));
        }
        styles.add(new Style("many-fields", 3, 0, many));
        return styles;
    }

    private byte[] blankPdf(int pages, int rotation) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                page.setRotation(rotation);
                document.addPage(page);
            }
            document.getDocumentCatalog().setAcroForm(new PDAcroForm(document));
            document.save(out);
            return out.toByteArray();
        }
    }

    // -- the test ------------------------------------------------------

    @ParameterizedTest(name = "{0}")
    @MethodSource("styles")
    @DisplayName("bundled list matches the follow-up request it replaces")
    void bundleMatchesRefetch(Style style) throws Exception {
        byte[] source = blankPdf(style.pages(), style.rotation());
        MockMultipartFile upload =
                new MockMultipartFile("file", style.name() + ".pdf", "application/pdf", source);
        byte[] edits = objectMapper.writeValueAsBytes(Map.of("add", style.fields()));

        byte[] zipBytes;
        try (PDDocument document = Loader.loadPDF(source)) {
            when(pdfDocumentFactory.load(eq(upload))).thenReturn(document);
            zipBytes = drain(controller.editFields(upload, edits, true));
        }
        Map<String, byte[]> bundle = unzip(zipBytes);

        assertThat(bundle).containsKeys("document.pdf", "fields.json");
        byte[] editedPdf = bundle.get("document.pdf");
        assertThat(new String(editedPdf, 0, 5, StandardCharsets.UTF_8)).isEqualTo("%PDF-");

        // The comparison that matters: ask the endpoint this feature stops re-calling,
        // and demand a match.
        MockMultipartFile saved =
                new MockMultipartFile("file", style.name() + ".pdf", "application/pdf", editedPdf);
        try (PDDocument reloaded = Loader.loadPDF(editedPdf)) {
            when(pdfDocumentFactory.load(eq(saved), eq(true))).thenReturn(reloaded);
            ResponseEntity<List<FormFieldWithCoordinates>> refetched =
                    controller.listFieldsWithCoordinates(saved);
            assertThat(new String(bundle.get("fields.json"), StandardCharsets.UTF_8))
                    .isEqualTo(objectMapper.writeValueAsString(refetched.getBody()));
        }

        dumpFixture(style.name(), zipBytes);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("styles")
    @DisplayName("pdf entry is stored and json entry is deflated")
    void perEntryCompression(Style style) throws Exception {
        byte[] source = blankPdf(style.pages(), style.rotation());
        MockMultipartFile upload =
                new MockMultipartFile("file", style.name() + ".pdf", "application/pdf", source);
        byte[] edits = objectMapper.writeValueAsBytes(Map.of("add", style.fields()));

        byte[] zipBytes;
        try (PDDocument document = Loader.loadPDF(source)) {
            when(pdfDocumentFactory.load(eq(upload))).thenReturn(document);
            zipBytes = drain(controller.editFields(upload, edits, true));
        }

        Map<String, Integer> methods = methodsOf(zipBytes);
        assertThat(methods.get("document.pdf")).isEqualTo(ZipEntry.STORED);
        assertThat(methods.get("fields.json")).isEqualTo(ZipEntry.DEFLATED);
    }

    @Test
    @DisplayName("hierarchical field names survive the bundle")
    void nestedFieldNames() throws Exception {
        byte[] source = nestedPdf();
        MockMultipartFile upload =
                new MockMultipartFile("file", "nested.pdf", "application/pdf", source);
        byte[] edits =
                objectMapper.writeValueAsBytes(
                        Map.of(
                                "modify",
                                List.of(
                                        Map.of(
                                                "targetName",
                                                "Customer.Name",
                                                "defaultValue",
                                                "Ada"))));

        byte[] zipBytes;
        try (PDDocument document = Loader.loadPDF(source)) {
            when(pdfDocumentFactory.load(eq(upload))).thenReturn(document);
            zipBytes = drain(controller.editFields(upload, edits, true));
        }
        Map<String, byte[]> bundle = unzip(zipBytes);
        byte[] editedPdf = bundle.get("document.pdf");

        MockMultipartFile saved =
                new MockMultipartFile("file", "nested.pdf", "application/pdf", editedPdf);
        try (PDDocument reloaded = Loader.loadPDF(editedPdf)) {
            when(pdfDocumentFactory.load(eq(saved), eq(true))).thenReturn(reloaded);
            ResponseEntity<List<FormFieldWithCoordinates>> refetched =
                    controller.listFieldsWithCoordinates(saved);
            String bundled = new String(bundle.get("fields.json"), StandardCharsets.UTF_8);
            assertThat(bundled).contains("Customer.Name");
            assertThat(bundled).isEqualTo(objectMapper.writeValueAsString(refetched.getBody()));
        }
    }

    /** Builds a parent field with two children, which add-fields cannot express. */
    private byte[] nestedPdf() throws IOException {
        try (PDDocument document = Loader.loadPDF(blankPdf(1, 0));
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            FormUtils.addNewFields(
                    document,
                    List.of(
                            field("Name", "text", 0, 700f, null),
                            field("Email", "text", 0, 660f, null)));

            PDNonTerminalField parent = new PDNonTerminalField(form);
            parent.setPartialName("Customer");
            List<PDField> kids = new ArrayList<>();
            for (String child : List.of("Name", "Email")) {
                PDField kid = form.getField(child);
                kid.getCOSObject().setItem(COSName.PARENT, parent.getCOSObject());
                kids.add(kid);
            }
            parent.setChildren(kids);
            form.setFields(List.of(parent));
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    @DisplayName("bundle stays close to the wire cost of the two calls it replaces")
    void wireCost() throws Exception {
        Style style =
                styles().stream()
                        .filter(s -> s.name().equals("many-fields"))
                        .findFirst()
                        .orElseThrow();
        byte[] source = blankPdf(style.pages(), style.rotation());
        MockMultipartFile upload =
                new MockMultipartFile("file", "cost.pdf", "application/pdf", source);
        byte[] edits = objectMapper.writeValueAsBytes(Map.of("add", style.fields()));

        byte[] zipBytes;
        Map<String, byte[]> bundle;
        try (PDDocument document = Loader.loadPDF(source)) {
            when(pdfDocumentFactory.load(eq(upload))).thenReturn(document);
            zipBytes = drain(controller.editFields(upload, edits, true));
        }
        bundle = unzip(zipBytes);

        int pdfSize = bundle.get("document.pdf").length;
        int jsonSize = bundle.get("fields.json").length;
        System.out.printf(
                "wire: pdf=%d json=%d zip=%d overhead=%d bytes (%.2f%% over the pdf alone)%n",
                pdfSize,
                jsonSize,
                zipBytes.length,
                zipBytes.length - pdfSize,
                100.0 * (zipBytes.length - pdfSize) / pdfSize);

        // True for a field list this repetitive; on a tiny list the ~200 bytes of zip framing can
        // exceed what deflate saves, so this is a property of the fixture, not of every document.
        assertThat(zipBytes.length).isLessThan(pdfSize + jsonSize);
    }

    // -- helpers -------------------------------------------------------

    private static byte[] drain(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(out);
        }
        return out.toByteArray();
    }

    private static Map<String, byte[]> unzip(byte[] zipBytes) throws IOException {
        Map<String, byte[]> entries = new HashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            for (ZipEntry entry; (entry = in.getNextEntry()) != null; ) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                in.transferTo(out);
                entries.put(entry.getName(), out.toByteArray());
            }
        }
        return entries;
    }

    private static Map<String, Integer> methodsOf(byte[] zipBytes) throws IOException {
        Map<String, Integer> methods = new HashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            for (ZipEntry entry; (entry = in.getNextEntry()) != null; ) {
                methods.put(entry.getName(), entry.getMethod());
                in.transferTo(OutputStream.nullOutputStream());
            }
        }
        return methods;
    }

    private static void dumpFixture(String name, byte[] zipBytes) throws IOException {
        if (FIXTURE_DIR == null) {
            return;
        }
        Path dir = Paths.get(FIXTURE_DIR);
        Files.createDirectories(dir);
        Files.write(dir.resolve(name + ".zip"), zipBytes);
    }
}
