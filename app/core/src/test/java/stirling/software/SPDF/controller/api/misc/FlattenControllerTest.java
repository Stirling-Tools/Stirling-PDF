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
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
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
import stirling.software.common.service.CustomPDFDocumentFactory;
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
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
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
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(true);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void flatten_formsOnly_noAcroForm() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(true);

        // Mock doc without acro form
        PDDocument doc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(doc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getAcroForm()).thenReturn(null);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(doc).close();
    }

    @Test
    void flatten_formsOnly_withEmptyAcroForm() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(true);

        PDDocument doc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        PDAcroForm form = mock(PDAcroForm.class);
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(doc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getAcroForm()).thenReturn(form);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(form).flatten();
    }

    @Test
    void flatten_ioException() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(true);

        when(pdfDocumentFactory.load(file)).thenThrow(new IOException("corrupt"));

        assertThatThrownBy(() -> controller.flatten(request)).isInstanceOf(IOException.class);
    }

    @Test
    void flatten_formsOnlyNull_treatedAsFalse() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(null);

        // When flattenOnlyForms is null/false, it does full flatten (render to image)
        // This requires real PDF rendering, so we use a real doc
        PDDocument doc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(doc)).thenReturn(newDoc);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void flatten_formsOnlyFalse_fullFlatten() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(false);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(doc)).thenReturn(newDoc);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void flatten_fullFlatten_withCustomDpi() throws Exception {
        MockMultipartFile file = createPdf();
        FlattenRequest request = new FlattenRequest();
        request.setFileInput(file);
        request.setFlattenOnlyForms(false);
        request.setRenderDpi(150);

        PDDocument doc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(doc)).thenReturn(newDoc);

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

        PDDocument doc = Loader.loadPDF(file.getBytes());
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(doc)).thenReturn(newDoc);

        ResponseEntity<Resource> response = controller.flatten(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
