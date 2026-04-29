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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@DisplayName("FormFillController Tests")
class FormFillControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

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

    private MockMultipartFile pdfFile() throws IOException {
        return new MockMultipartFile("file", "test.pdf", "application/pdf", pdfBytes());
    }

    // ── listFields ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("listFields")
    class ListFields {

        @Test
        @DisplayName("returns OK with field extraction for valid PDF")
        void validPdf() throws Exception {
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file), eq(true))).thenReturn(doc);

            ResponseEntity<?> response = controller.listFields(file);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
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
            MockMultipartFile empty =
                    new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[0]);
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
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file), eq(true))).thenReturn(doc);

            ResponseEntity<?> response = controller.listFieldsWithCoordinates(file);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
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
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file), eq(true))).thenReturn(doc);

            ResponseEntity<byte[]> response = controller.extractCsv(file, null);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
            String csv = new String(response.getBody());
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
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file), eq(true))).thenReturn(doc);

            ResponseEntity<byte[]> response = controller.extractXlsx(file, null);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
            assertThat(response.getBody().length).isGreaterThan(0);
        }

        @Test
        @DisplayName("throws for empty file")
        void emptyFile() {
            MockMultipartFile empty =
                    new MockMultipartFile("file", "test.pdf", "application/pdf", new byte[0]);
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
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(doc);

            byte[] payload = "{\"field1\":\"value1\"}".getBytes();
            ResponseEntity<Resource> response = controller.fillForm(file, payload, false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
        }

        @Test
        @DisplayName("handles null payload gracefully")
        void nullPayload() throws Exception {
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(doc);

            ResponseEntity<Resource> response = controller.fillForm(file, null, false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
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
            assertThatThrownBy(() -> controller.deleteFields(pdfFile(), "[]".getBytes()))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("processes valid name list")
        void validPayload() throws Exception {
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(doc);

            byte[] payload = "[\"field1\"]".getBytes();
            ResponseEntity<Resource> response = controller.deleteFields(file, payload);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
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
            assertThatThrownBy(() -> controller.modifyFields(pdfFile(), "[]".getBytes()))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("processes valid modification payload")
        void validPayload() throws Exception {
            MockMultipartFile file = pdfFile();
            PDDocument doc = createMinimalPdf();
            when(pdfDocumentFactory.load(eq(file))).thenReturn(doc);

            String json =
                    "[{\"targetName\":\"f1\",\"name\":null,\"label\":null,\"type\":null,"
                            + "\"required\":null,\"multiSelect\":null,\"options\":null,\"defaultValue\":\"newVal\",\"tooltip\":null}]";
            ResponseEntity<Resource> response = controller.modifyFields(file, json.getBytes());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
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
                            "buildBaseName",
                            org.springframework.web.multipart.MultipartFile.class,
                            String.class);
            method.setAccessible(true);

            MockMultipartFile file =
                    new MockMultipartFile("file", "report.pdf", "application/pdf", new byte[] {1});
            String result = (String) method.invoke(null, file, "filled");
            assertThat(result).isEqualTo("report_filled");
        }

        @Test
        @DisplayName("handles file without .pdf extension")
        void noPdfExtension() throws Exception {
            var method =
                    FormFillController.class.getDeclaredMethod(
                            "buildBaseName",
                            org.springframework.web.multipart.MultipartFile.class,
                            String.class);
            method.setAccessible(true);

            MockMultipartFile file =
                    new MockMultipartFile("file", "report.docx", "application/pdf", new byte[] {1});
            String result = (String) method.invoke(null, file, "filled");
            assertThat(result).isEqualTo("report.docx_filled");
        }

        @Test
        @DisplayName("uses 'document' for null original filename")
        void nullFilename() throws Exception {
            var method =
                    FormFillController.class.getDeclaredMethod(
                            "buildBaseName",
                            org.springframework.web.multipart.MultipartFile.class,
                            String.class);
            method.setAccessible(true);

            MockMultipartFile file =
                    new MockMultipartFile("file", null, "application/pdf", new byte[] {1});
            String result = (String) method.invoke(null, file, "filled");
            assertThat(result).isEqualTo("document_filled");
        }
    }
}
