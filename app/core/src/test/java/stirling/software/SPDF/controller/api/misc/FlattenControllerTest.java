package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
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
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class FlattenControllerTest {

    private static byte[] drainBody(Response response) throws IOException {
        Object entity = response.getEntity();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        if (entity instanceof byte[] bytes) {
            baos.write(bytes);
        } else if (entity instanceof StreamingOutput streaming) {
            streaming.write(baos);
        } else {
            throw new IllegalStateException(
                    "Unexpected response entity type: "
                            + (entity == null ? "null" : entity.getClass().getName()));
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

    private byte[] createPdfBytes() throws IOException {
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
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Test
    void flatten_formsOnly_withAcroForm() throws Exception {
        byte[] bytes = createPdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        PDDocument doc = Loader.loadPDF(bytes);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);

        Response response = controller.flatten(file, null, true, null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void flatten_formsOnly_noAcroForm() throws Exception {
        byte[] bytes = createPdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        // Mock doc without acro form
        PDDocument doc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);
        when(doc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getAcroForm()).thenReturn(null);

        Response response = controller.flatten(file, null, true, null);

        assertThat(response.getStatus()).isEqualTo(200);
        verify(doc).close();
    }

    @Test
    void flatten_formsOnly_withEmptyAcroForm() throws Exception {
        byte[] bytes = createPdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        PDDocument doc = mock(PDDocument.class);
        PDDocumentCatalog catalog = mock(PDDocumentCatalog.class);
        PDAcroForm form = mock(PDAcroForm.class);
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);
        when(doc.getDocumentCatalog()).thenReturn(catalog);
        when(catalog.getAcroForm()).thenReturn(form);

        Response response = controller.flatten(file, null, true, null);

        assertThat(response.getStatus()).isEqualTo(200);
        verify(form).flatten();
    }

    @Test
    void flatten_ioException() throws Exception {
        byte[] bytes = createPdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenThrow(new IOException("corrupt"));

        assertThatThrownBy(() -> controller.flatten(file, null, true, null))
                .isInstanceOf(IOException.class);
    }

    @Test
    void flatten_formsOnlyNull_treatedAsFalse() throws Exception {
        byte[] bytes = createPdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        // When flattenOnlyForms is null/false, it does full flatten (render to image)
        // This requires real PDF rendering, so we use a real doc
        PDDocument doc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(doc)).thenReturn(newDoc);

        Response response = controller.flatten(file, null, null, null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void flatten_formsOnlyFalse_fullFlatten() throws Exception {
        byte[] bytes = createPdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        PDDocument doc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(doc)).thenReturn(newDoc);

        Response response = controller.flatten(file, null, false, null);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void flatten_fullFlatten_withCustomDpi() throws Exception {
        byte[] bytes = createPdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        PDDocument doc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(doc)).thenReturn(newDoc);

        Response response = controller.flatten(file, null, false, 150);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void flatten_fullFlatten_lowDpiClampedTo72() throws Exception {
        byte[] bytes = createPdfBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        PDDocument doc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(doc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(doc)).thenReturn(newDoc);

        Response response = controller.flatten(file, null, false, 10); // Below minimum of 72

        assertThat(response.getStatus()).isEqualTo(200);
    }
}
