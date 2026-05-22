package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

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
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.PosterPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class PosterPdfControllerTest {

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
    @InjectMocks private PosterPdfController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        inv -> Files.createTempFile("test", inv.<String>getArgument(0)).toFile());
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
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(file.getBytes()));
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());
    }

    private byte[] firstPdfFromZip(byte[] zipBytes) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry = zis.getNextEntry();
            assertThat(entry).isNotNull();
            assertThat(entry.getName()).endsWith(".pdf");
            return zis.readAllBytes();
        }
    }

    @Test
    void posterPdf_default2x2_producesFourPagesPerInput() throws Exception {
        MockMultipartFile file = createRealPdf(1, 600f, 800f);
        wireFactory(file);

        PosterPdfRequest request = new PosterPdfRequest();
        request.setFileInput(file);
        request.setPageSize("A4");
        request.setXFactor(2);
        request.setYFactor(2);

        ResponseEntity<Resource> response = controller.posterPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        byte[] zip = drainBody(response);
        try (PDDocument out = Loader.loadPDF(firstPdfFromZip(zip))) {
            assertThat(out.getNumberOfPages()).isEqualTo(4);
            assertThat(out.getPage(0).getMediaBox().getWidth())
                    .isEqualTo(PDRectangle.A4.getWidth());
        }
    }

    @Test
    void posterPdf_3x2_producesSixPagesPerInput() throws Exception {
        MockMultipartFile file = createRealPdf(2, 600f, 400f);
        wireFactory(file);

        PosterPdfRequest request = new PosterPdfRequest();
        request.setFileInput(file);
        request.setPageSize("Letter");
        request.setXFactor(3);
        request.setYFactor(2);

        ResponseEntity<Resource> response = controller.posterPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        try (PDDocument out = Loader.loadPDF(firstPdfFromZip(drainBody(response)))) {
            assertThat(out.getNumberOfPages()).isEqualTo(12);
            assertThat(out.getPage(0).getMediaBox().getWidth())
                    .isEqualTo(PDRectangle.LETTER.getWidth());
        }
    }

    @Test
    void posterPdf_rightToLeftOrdering_stillSameTotalCount() throws Exception {
        MockMultipartFile file = createRealPdf(1, 600f, 400f);
        wireFactory(file);

        PosterPdfRequest request = new PosterPdfRequest();
        request.setFileInput(file);
        request.setPageSize("A4");
        request.setXFactor(2);
        request.setYFactor(2);
        request.setRightToLeft(true);

        ResponseEntity<Resource> response = controller.posterPdf(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        try (PDDocument out = Loader.loadPDF(firstPdfFromZip(drainBody(response)))) {
            assertThat(out.getNumberOfPages()).isEqualTo(4);
        }
    }

    @Test
    void posterPdf_invalidPageSize_throws() throws Exception {
        MockMultipartFile file = createRealPdf(1, 600f, 400f);
        wireFactory(file);

        PosterPdfRequest request = new PosterPdfRequest();
        request.setFileInput(file);
        request.setPageSize("Foo");
        request.setXFactor(2);
        request.setYFactor(2);

        assertThatThrownBy(() -> controller.posterPdf(request))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
