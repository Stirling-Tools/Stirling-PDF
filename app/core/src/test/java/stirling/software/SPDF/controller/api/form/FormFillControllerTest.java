package stirling.software.SPDF.controller.api.form;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.ByteArrayMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@DisplayName("FormFillController Tests")
class FormFillControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private ObjectMapper realObjectMapper;

    @InjectMocks private FormFillController controller;

    @BeforeEach
    void setUp() throws Exception {
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
        realObjectMapper = JsonMapper.builder().build();
        // Inject real ObjectMapper via reflection since @InjectMocks uses the mock
        var field = FormFillController.class.getDeclaredField("objectMapper");
        field.setAccessible(true);
        field.set(controller, realObjectMapper);
    }

    private PDDocument createMinimalPdf() {
        PDDocument doc = new PDDocument();
        doc.addPage(new PDPage(PDRectangle.A4));
        PDAcroForm acroForm = new PDAcroForm(doc);
        doc.getDocumentCatalog().setAcroForm(acroForm);
        return doc;
    }

    private byte[] pdfBytes() throws IOException {
        try (PDDocument doc = createMinimalPdf();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private FileUpload pdfFile() throws IOException {
        return TestFileUploads.of(pdfBytes(), "test.pdf", "application/pdf");
    }

    private static FileUpload jsonPart(byte[] bytes) {
        return TestFileUploads.of(bytes, "data.json", "application/json");
    }

    // ── listFields ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("listFields")
    class ListFields {

        @Test
        @DisplayName("returns OK with field extraction for valid PDF")
        void validPdf() throws Exception {
            FileUpload file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(doc);

            Response response = controller.listFields(file);

            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(response.getEntity()).isNotNull();
        }

        @Test
        @DisplayName("throws for null file")
        void nullFile() {
            assertThatThrownBy(() -> controller.listFields(null))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("throws for empty file")
        void emptyFile() {
            FileUpload empty = TestFileUploads.of(new byte[0], "test.pdf", "application/pdf");
            assertThatThrownBy(() -> controller.listFields(empty))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ── listFieldsWithCoordinates ──────────────────────────────────────

    @Nested
    @DisplayName("listFieldsWithCoordinates")
    class ListFieldsWithCoordinates {

        @Test
        @DisplayName("returns OK with coordinates for valid PDF")
        void validPdf() throws Exception {
            FileUpload file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(doc);

            Response response = controller.listFieldsWithCoordinates(file);

            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(response.getEntity()).isNotNull();
        }

        @Test
        @DisplayName("throws for null file")
        void nullFile() {
            assertThatThrownBy(() -> controller.listFieldsWithCoordinates(null))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ── extractCsv ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("extractCsv")
    class ExtractCsv {

        @Test
        @DisplayName("returns CSV response for valid PDF without data")
        void validPdfNullData() throws Exception {
            FileUpload file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(doc);

            Response response = controller.extractCsv(file, null);

            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(response.getEntity()).isNotNull();
            String csv = new String((byte[]) response.getEntity());
            assertThat(csv).contains("Field Name");
        }

        @Test
        @DisplayName("throws for null file")
        void nullFile() {
            assertThatThrownBy(() -> controller.extractCsv(null, null))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ── extractXlsx ────────────────────────────────────────────────────

    @Nested
    @DisplayName("extractXlsx")
    class ExtractXlsx {

        @Test
        @DisplayName("returns XLSX response for valid PDF without data")
        void validPdfNullData() throws Exception {
            FileUpload file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(doc);

            Response response = controller.extractXlsx(file, null);

            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(response.getEntity()).isNotNull();
            assertThat(((byte[]) response.getEntity()).length).isGreaterThan(0);
        }

        @Test
        @DisplayName("throws for empty file")
        void emptyFile() {
            FileUpload empty = TestFileUploads.of(new byte[0], "test.pdf", "application/pdf");
            assertThatThrownBy(() -> controller.extractXlsx(empty, null))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ── fillForm ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("fillForm")
    class FillForm {

        @Test
        @DisplayName("returns filled PDF for valid input")
        void validInput() throws Exception {
            FileUpload file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);

            FileUpload payload = jsonPart("{\"field1\":\"value1\"}".getBytes());
            Response response = controller.fillForm(file, payload, false);

            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(response.getEntity()).isNotNull();
        }

        @Test
        @DisplayName("handles null payload gracefully")
        void nullPayload() throws Exception {
            FileUpload file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);

            Response response = controller.fillForm(file, null, false);

            assertThat(response.getStatus()).isEqualTo(200);
        }

        @Test
        @DisplayName("throws for null file")
        void nullFile() {
            assertThatThrownBy(() -> controller.fillForm(null, null, false))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // ── deleteFields ───────────────────────────────────────────────────

    @Nested
    @DisplayName("deleteFields")
    class DeleteFields {

        @Test
        @DisplayName("throws when names payload is null")
        void nullPayload() {
            assertThatThrownBy(() -> controller.deleteFields(pdfFile(), null))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("throws when names payload is empty JSON array")
        void emptyPayload() {
            assertThatThrownBy(() -> controller.deleteFields(pdfFile(), jsonPart("[]".getBytes())))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("processes valid name list")
        void validPayload() throws Exception {
            FileUpload file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);

            FileUpload payload = jsonPart("[\"field1\"]".getBytes());
            Response response = controller.deleteFields(file, payload);

            assertThat(response.getStatus()).isEqualTo(200);
        }
    }

    // ── modifyFields ───────────────────────────────────────────────────

    @Nested
    @DisplayName("modifyFields")
    class ModifyFields {

        @Test
        @DisplayName("throws when updates payload is null")
        void nullPayload() {
            assertThatThrownBy(() -> controller.modifyFields(pdfFile(), null))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("throws when updates payload is empty list")
        void emptyPayload() {
            assertThatThrownBy(() -> controller.modifyFields(pdfFile(), jsonPart("[]".getBytes())))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("processes valid modification payload")
        void validPayload() throws Exception {
            FileUpload file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);

            String json =
                    "[{\"targetName\":\"f1\",\"name\":null,\"label\":null,\"type\":null,"
                            + "\"required\":null,\"multiSelect\":null,\"options\":null,\"defaultValue\":\"newVal\",\"tooltip\":null}]";
            Response response = controller.modifyFields(file, jsonPart(json.getBytes()));

            assertThat(response.getStatus()).isEqualTo(200);
        }
    }

    // ── addFields ──────────────────────────────────────────────────────

    @Nested
    @DisplayName("addFields")
    class AddFields {

        @Test
        @DisplayName("throws when fields payload is null")
        void nullPayload() {
            assertThatThrownBy(() -> controller.addFields(pdfFile(), null))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("throws when fields payload is an empty list")
        void emptyPayload() {
            assertThatThrownBy(() -> controller.addFields(pdfFile(), "[]".getBytes()))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("processes a valid new-field payload")
        void validPayload() throws Exception {
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(doc);

            String json =
                    "[{\"name\":\"NewField\",\"type\":\"text\",\"pageIndex\":0,"
                            + "\"x\":50,\"y\":700,\"width\":200,\"height\":20}]";
            ResponseEntity<Resource> response = controller.addFields(file, json.getBytes());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
        }
    }

    // ── editFields (combined) ──────────────────────────────────────────

    @Nested
    @DisplayName("editFields")
    class EditFields {

        @Test
        @DisplayName("throws when edits payload is null")
        void nullPayload() {
            assertThatThrownBy(() -> controller.editFields(pdfFile(), null, false))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("throws when all sections are empty")
        void emptyBatch() {
            assertThatThrownBy(
                            () ->
                                    controller.editFields(
                                            pdfFile(),
                                            "{\"add\":[],\"modify\":[],\"delete\":[]}".getBytes(),
                                            false))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("processes a combined add/delete batch")
        void validBatch() throws Exception {
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(doc);

            String json =
                    "{\"add\":[{\"name\":\"f\",\"type\":\"text\",\"pageIndex\":0,\"x\":50,"
                            + "\"y\":700,\"width\":200,\"height\":20}],\"modify\":[],"
                            + "\"delete\":[]}";
            ResponseEntity<Resource> response = controller.editFields(file, json.getBytes(), false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
        }

        @Test
        @DisplayName("refuses a field name containing a period before touching the document")
        void refusesPeriodInName() throws Exception {
            String json =
                    "{\"add\":[{\"name\":\"Customer.Name\",\"type\":\"text\",\"pageIndex\":0,"
                            + "\"x\":50,\"y\":700,\"width\":200,\"height\":20}]}";

            assertThatThrownBy(() -> controller.editFields(pdfFile(), json.getBytes(), false))
                    .hasMessageContaining("period");
            // Rejected up front, so the document is never even loaded.
            verify(pdfDocumentFactory, never()).load(any(MockMultipartFile.class));
        }

        @Test
        @DisplayName("renaming a nested field to its own qualified name is not a rename")
        void allowsUnchangedQualifiedName() throws Exception {
            MockMultipartFile file = pdfFile();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(createMinimalPdf());

            String json =
                    "{\"modify\":[{\"targetName\":\"Customer.Name\",\"name\":\"Customer.Name\","
                            + "\"x\":10,\"y\":10}]}";
            ResponseEntity<Resource> response = controller.editFields(file, json.getBytes(), false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            // It must get past validation into the edit loop: the only complaint should be that
            // this document has no such field, never that the name contains a period.
            String encoded =
                    response.getHeaders().getFirst(FormFillController.SKIPPED_EDITS_HEADER);
            assertThat(encoded).isNotNull();
            String report =
                    new String(
                            java.util.Base64.getDecoder().decode(encoded),
                            java.nio.charset.StandardCharsets.UTF_8);
            assertThat(report).contains("no field with that name exists").doesNotContain("period");
        }

        @Test
        @DisplayName("reports a dropped edit as base64 JSON in the skipped-edits header")
        void reportsSkippedEdits() throws Exception {
            MockMultipartFile file = pdfFile();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(createMinimalPdf());

            String json = "{\"delete\":[\"noSuchField\"]}";
            ResponseEntity<Resource> response = controller.editFields(file, json.getBytes(), false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            String encoded =
                    response.getHeaders().getFirst(FormFillController.SKIPPED_EDITS_HEADER);
            assertThat(encoded).isNotNull();
            String report =
                    new String(
                            java.util.Base64.getDecoder().decode(encoded),
                            java.nio.charset.StandardCharsets.UTF_8);
            assertThat(report).contains("noSuchField").contains("delete");
            // Base64 rather than percent-encoding, so spaces survive as spaces.
            assertThat(report).contains("no field with that name exists");
        }

        @Test
        @DisplayName("omits the skipped-edits header when everything applied")
        void noHeaderOnCleanBatch() throws Exception {
            MockMultipartFile file = pdfFile();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(createMinimalPdf());

            String json =
                    "{\"add\":[{\"name\":\"clean\",\"type\":\"text\",\"pageIndex\":0,\"x\":50,"
                            + "\"y\":700,\"width\":200,\"height\":20}]}";
            ResponseEntity<Resource> response = controller.editFields(file, json.getBytes(), false);

            assertThat(response.getHeaders().getFirst(FormFillController.SKIPPED_EDITS_HEADER))
                    .isNull();
        }
    }

    // ── buildBaseName ──────────────────────────────────────────────────

    @Nested
    @DisplayName("buildBaseName (via reflection)")
    class BuildBaseName {

        @Test
        @DisplayName("strips .pdf extension and appends suffix")
        void stripsExtension() throws Exception {
            var method =
                    FormFillController.class.getDeclaredMethod(
                            "buildBaseName", MultipartFile.class, String.class);
            method.setAccessible(true);

            MultipartFile file =
                    new ByteArrayMultipartFile(
                            "file", "report.pdf", "application/pdf", new byte[] {1});
            String result = (String) method.invoke(null, file, "filled");
            assertThat(result).isEqualTo("report_filled");
        }

        @Test
        @DisplayName("handles file without .pdf extension")
        void noPdfExtension() throws Exception {
            var method =
                    FormFillController.class.getDeclaredMethod(
                            "buildBaseName", MultipartFile.class, String.class);
            method.setAccessible(true);

            MultipartFile file =
                    new ByteArrayMultipartFile(
                            "file", "report.docx", "application/pdf", new byte[] {1});
            String result = (String) method.invoke(null, file, "filled");
            assertThat(result).isEqualTo("report.docx_filled");
        }

        @Test
        @DisplayName("uses 'document' for null original filename")
        void nullFilename() throws Exception {
            var method =
                    FormFillController.class.getDeclaredMethod(
                            "buildBaseName", MultipartFile.class, String.class);
            method.setAccessible(true);

            MultipartFile file =
                    new ByteArrayMultipartFile("file", null, "application/pdf", new byte[] {1});
            String result = (String) method.invoke(null, file, "filled");
            assertThat(result).isEqualTo("document_filled");
        }
    }

    // -- includeFields bundle ------------------------------------------

    @Nested
    @DisplayName("editFields ?includeFields=true")
    class FieldBundle {

        private byte[] editsPayload() {
            return ("{\"add\":[{\"name\":\"bundled\",\"type\":\"text\",\"pageIndex\":0,"
                            + "\"x\":50,\"y\":700,\"width\":200,\"height\":20}]}")
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }

        private java.util.Map<String, java.util.zip.ZipEntry> entriesOf(byte[] zipBytes)
                throws IOException {
            java.util.Map<String, java.util.zip.ZipEntry> found = new java.util.HashMap<>();
            try (java.util.zip.ZipInputStream in =
                    new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(zipBytes))) {
                for (java.util.zip.ZipEntry e; (e = in.getNextEntry()) != null; ) {
                    java.io.ByteArrayOutputStream data = new java.io.ByteArrayOutputStream();
                    in.transferTo(data);
                    // getMethod/getSize are only final once the entry has been fully read.
                    found.put(e.getName(), e);
                    payloads.put(e.getName(), data.toByteArray());
                }
            }
            return found;
        }

        private final java.util.Map<String, byte[]> payloads = new java.util.HashMap<>();

        private byte[] bundleFor(MockMultipartFile file) throws Exception {
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(doc);
            ResponseEntity<Resource> response = controller.editFields(file, editsPayload(), true);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            return drainBody(response);
        }

        @Test
        @DisplayName("returns a zip holding the pdf and the field list")
        void bundlesBoth() throws Exception {
            byte[] zip = bundleFor(pdfFile());
            entriesOf(zip);

            assertThat(payloads).containsKeys("document.pdf", "fields.json");
            assertThat(new String(payloads.get("document.pdf"), 0, 5)).isEqualTo("%PDF-");
            assertThat(
                            new String(
                                    payloads.get("fields.json"),
                                    java.nio.charset.StandardCharsets.UTF_8))
                    .contains("bundled");
        }

        @Test
        @DisplayName("stores the pdf entry but deflates the json")
        void perEntryMethods() throws Exception {
            byte[] zip = bundleFor(pdfFile());
            java.util.Map<String, java.util.zip.ZipEntry> entries = entriesOf(zip);

            assertThat(entries.get("document.pdf").getMethod())
                    .as("deflating an already-compressed PDF burns CPU for almost nothing")
                    .isEqualTo(java.util.zip.ZipEntry.STORED);
            assertThat(entries.get("fields.json").getMethod())
                    .as("the JSON is text and no longer gets the container's gzip")
                    .isEqualTo(java.util.zip.ZipEntry.DEFLATED);
        }

        @Test
        @DisplayName("bundled fields match what a follow-up fetch would have returned")
        void matchesTheSecondCallItReplaces() throws Exception {
            byte[] zip = bundleFor(pdfFile());
            entriesOf(zip);
            byte[] bundledPdf = payloads.get("document.pdf");

            // Re-ask the endpoint this feature stops re-calling, using the returned bytes.
            MockMultipartFile saved =
                    new MockMultipartFile("file", "test.pdf", "application/pdf", bundledPdf);
            try (PDDocument reloaded = org.apache.pdfbox.Loader.loadPDF(bundledPdf)) {
                when(pdfDocumentFactory.load(eq(saved), eq(true))).thenReturn(reloaded);
                ResponseEntity<
                                java.util.List<
                                        stirling.software.common.model.FormFieldWithCoordinates>>
                        refetched = controller.listFieldsWithCoordinates(saved);

                String viaRefetch = realObjectMapper.writeValueAsString(refetched.getBody());
                String viaBundle =
                        new String(
                                payloads.get("fields.json"),
                                java.nio.charset.StandardCharsets.UTF_8);
                assertThat(viaBundle)
                        .as("the bundle must be interchangeable with the round trip it removes")
                        .isEqualTo(viaRefetch);
            }
        }

        @Test
        @DisplayName("omitting the flag still returns a bare pdf")
        void defaultsToPlainPdf() throws Exception {
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(doc);

            byte[] body = drainBody(controller.editFields(file, editsPayload(), false));

            assertThat(new String(body, 0, 5)).isEqualTo("%PDF-");
        }
    }

    // -- skipped-edits header budget -----------------------------------

    @Nested
    @DisplayName("skipped-edits header")
    class SkipHeaderBudget {

        @Test
        @DisplayName("stays within budget however long the reported names are")
        void staysWithinBudget() throws Exception {
            java.util.List<FormUtils.SkippedFieldEdit> skipped = new java.util.ArrayList<>();
            String huge = "x".repeat(20000);
            for (int i = 0; i < 40; i++) {
                skipped.add(new FormUtils.SkippedFieldEdit("modify", huge, huge));
            }

            var method =
                    FormFillController.class.getDeclaredMethod(
                            "withSkippedEdits", ResponseEntity.class, java.util.List.class);
            method.setAccessible(true);
            @SuppressWarnings("unchecked")
            ResponseEntity<Resource> response =
                    (ResponseEntity<Resource>)
                            method.invoke(controller, streamingOk(new byte[] {1}), skipped);

            String header = response.getHeaders().getFirst(FormFillController.SKIPPED_EDITS_HEADER);
            assertThat(header).isNotNull();
            // Not merely short: an empty header would pass a length check while telling the
            // user nothing, because the alert renders only when it has entries.
            String decoded =
                    new String(
                            java.util.Base64.getDecoder().decode(header),
                            java.nio.charset.StandardCharsets.UTF_8);
            assertThat(decoded).startsWith("[{");
            assertThat(decoded).contains("...");
            // Overflowing the container's header budget turns the reply into an error page,
            // which loses the edited PDF the user just saved.
            assertThat(header.length()).isLessThanOrEqualTo(4096);
            assertThat(
                            response.getHeaders()
                                    .getFirst(FormFillController.SKIPPED_EDITS_TOTAL_HEADER))
                    .isEqualTo("40");
        }
    }
}
