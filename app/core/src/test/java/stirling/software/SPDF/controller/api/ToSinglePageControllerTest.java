package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ToSinglePageControllerTest {

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private ToSinglePageController controller;

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

    private MockMultipartFile createRealPdf(int numPages, float width, float height)
            throws IOException {
        Path path = tempDir.resolve("input.pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(new PDRectangle(width, height)));
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "input.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(path));
    }

    private void wireFactory(MockMultipartFile file) throws IOException {
        when(pdfDocumentFactory.load(any(PDFFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(file.getBytes()));
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());
    }

    @Test
    void singlePage_combinesIntoOneTallPage() throws Exception {
        MockMultipartFile file = createRealPdf(3, 200f, 300f);
        wireFactory(file);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<Resource> response = controller.pdfToSinglePage(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
        byte[] body = drainBody(response);
        assertThat(body).isNotEmpty();

        try (PDDocument out = Loader.loadPDF(body)) {
            assertThat(out.getNumberOfPages()).isEqualTo(1);
            PDRectangle box = out.getPage(0).getMediaBox();
            assertThat(box.getWidth()).isEqualTo(200f);
            assertThat(box.getHeight()).isEqualTo(900f);
        }
    }

    @Test
    void singlePageInput_returnsOnePage() throws Exception {
        MockMultipartFile file = createRealPdf(1, 612f, 792f);
        wireFactory(file);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<Resource> response = controller.pdfToSinglePage(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            assertThat(out.getNumberOfPages()).isEqualTo(1);
        }
    }

    @Test
    void filenameSuffixApplied() throws Exception {
        MockMultipartFile file = createRealPdf(2, 100f, 100f);
        wireFactory(file);

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<Resource> response = controller.pdfToSinglePage(request);
        assertThat(response.getHeaders().getContentDisposition().getFilename())
                .isEqualTo("input_singlePage.pdf");
    }

    @Test
    void propagatesIoException() throws Exception {
        MockMultipartFile file = createRealPdf(2, 100f, 100f);
        when(pdfDocumentFactory.load(any(PDFFile.class))).thenThrow(new IOException("load failed"));

        PDFFile request = new PDFFile();
        request.setFileInput(file);

        assertThatThrownBy(() -> controller.pdfToSinglePage(request))
                .isInstanceOf(IOException.class);
    }
}
