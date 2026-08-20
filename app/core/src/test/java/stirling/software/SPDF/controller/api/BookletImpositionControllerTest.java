package stirling.software.SPDF.controller.api;

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
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
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
class BookletImpositionControllerTest {

    private static byte[] drainBody(Response response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ((StreamingOutput) response.getEntity()).write(baos);
        return baos.toByteArray();
    }

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private BookletImpositionController controller;

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

    private byte[] createRealPdf(int numPages) throws IOException {
        Path path = tempDir.resolve("test-" + numPages + ".pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(PDRectangle.LETTER));
            }
            doc.save(path.toFile());
        }
        return Files.readAllBytes(path);
    }

    private FileUpload upload(byte[] bytes) {
        return TestFileUploads.pdf(bytes);
    }

    @Test
    void createBookletImposition_basicSuccess() throws IOException {
        byte[] bytes = createRealPdf(4);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, null, null, null, null, null, null, null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void createBookletImposition_invalidPagesPerSheet() throws IOException {
        byte[] bytes = createRealPdf(4);

        assertThatThrownBy(
                        () ->
                                controller.createBookletImposition(
                                        upload(bytes),
                                        null,
                                        4,
                                        null,
                                        null,
                                        null,
                                        null,
                                        null,
                                        null,
                                        null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("2 pages per side");
    }

    @Test
    void createBookletImposition_withBorder() throws IOException {
        byte[] bytes = createRealPdf(4);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, true, null, null, null, null, null, null);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(drainBody(response)).isNotEmpty();
    }

    @Test
    void createBookletImposition_rightSpine() throws IOException {
        byte[] bytes = createRealPdf(4);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, null, "RIGHT", null, null, null, null, null);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void createBookletImposition_withGutter() throws IOException {
        byte[] bytes = createRealPdf(4);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, null, null, true, 20f, null, null, null);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void createBookletImposition_doubleSidedFirstPass() throws IOException {
        byte[] bytes = createRealPdf(8);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, null, null, null, null, true, "FIRST", null);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void createBookletImposition_doubleSidedSecondPass() throws IOException {
        byte[] bytes = createRealPdf(8);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, null, null, null, null, true, "SECOND", null);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void createBookletImposition_flipOnShortEdge() throws IOException {
        byte[] bytes = createRealPdf(4);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, null, null, null, null, true, null, true);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void createBookletImposition_singlePage() throws IOException {
        byte[] bytes = createRealPdf(1);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, null, null, null, null, null, null, null);

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void createBookletImposition_ioException() throws IOException {
        byte[] bytes = createRealPdf(4);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenThrow(new IOException("load error"));

        assertThatThrownBy(
                        () ->
                                controller.createBookletImposition(
                                        upload(bytes),
                                        null,
                                        2,
                                        null,
                                        null,
                                        null,
                                        null,
                                        null,
                                        null,
                                        null))
                .isInstanceOf(IOException.class);
    }

    @Test
    void createBookletImposition_negativeGutterClamped() throws IOException {
        byte[] bytes = createRealPdf(4);

        PDDocument sourceDoc = Loader.loadPDF(bytes);
        PDDocument newDoc = new PDDocument();
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc)).thenReturn(newDoc);

        Response response =
                controller.createBookletImposition(
                        upload(bytes), null, 2, null, null, true, -10f, null, null, null);

        assertThat(response.getStatus()).isEqualTo(200);
    }
}
