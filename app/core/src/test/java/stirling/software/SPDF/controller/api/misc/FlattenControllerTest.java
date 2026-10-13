package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.FlattenRequest;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class FlattenControllerTest {
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

    @TempDir Path tempDir;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private FlattenController controller;

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
    }

    private MockMultipartFile createPdf() throws IOException {
        Path path = tempDir.resolve("test.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 700);
                cs.showText("Test content");
                cs.endText();
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, Files.readAllBytes(path));
    }

    @Test
    void flatten_formsOnly_withAcroForm() throws Exception {
        MockMultipartFile file = createPdfWithForm();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(true);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        byte[] out = drainBody(response);
        assertThat(out).isNotEmpty();
        try (PDDocument flattened = Loader.loadPDF(out)) {
            assertThat(flattened.getNumberOfPages()).isEqualTo(1);
            // JPDFium burns widget appearances into page content but leaves the dead
            // field dictionaries behind; with no widgets left the form is non-interactive.
            assertThat(flattened.getPage(0).getAnnotations()).isEmpty();
        }
    }

    @Test
    void flatten_formsOnly_noAcroForm() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(true);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void flatten_ioException() throws Exception {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "corrupt.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "not a pdf".getBytes());
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(true);

        assertThatThrownBy(() -> controller.flatten(request)).isInstanceOf(IOException.class);
    }

    @Test
    void flatten_formsOnlyNull_treatedAsFalse() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(null);

        // When flattenOnlyForms is null/false, it does full flatten (page rasterization)
        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        byte[] out = drainBody(response);
        assertThat(out).isNotEmpty();
        try (PDDocument flattened = Loader.loadPDF(out)) {
            assertThat(flattened.getNumberOfPages()).isEqualTo(1);
        }
    }

    @Test
    void flatten_formsOnlyFalse_fullFlatten() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(false);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        byte[] out = drainBody(response);
        assertThat(out).isNotEmpty();
        try (PDDocument flattened = Loader.loadPDF(out)) {
            assertThat(flattened.getNumberOfPages()).isEqualTo(1);
            // Rasterized pages carry no extractable text
            String text = new org.apache.pdfbox.text.PDFTextStripper().getText(flattened);
            assertThat(text.trim()).isEmpty();
        }
    }

    @Test
    void flatten_fullFlatten_withCustomDpi() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(false);
        request.setRenderDpi(150);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void flatten_fullFlatten_lowDpiClampedTo72() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(false);
        request.setRenderDpi(10); // Below minimum of 72

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private MockMultipartFile createPdfWithForm() throws IOException {
        Path path = tempDir.resolve("form.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            org.apache.pdfbox.pdmodel.interactive.form.PDTextField field =
                    new org.apache.pdfbox.pdmodel.interactive.form.PDTextField(acroForm);
            field.setPartialName("name");
            org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget widget =
                    new org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget();
            widget.setRectangle(new PDRectangle(50, 700, 200, 20));
            widget.setPage(page);
            page.getAnnotations().add(widget);
            field.getWidgets().add(widget);
            acroForm.getFields().add(field);
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput", "form.pdf", MediaType.APPLICATION_PDF_VALUE, Files.readAllBytes(path));
    }
}
