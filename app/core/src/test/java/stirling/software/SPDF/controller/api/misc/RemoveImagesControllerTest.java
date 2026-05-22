package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
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
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class RemoveImagesControllerTest {

    @TempDir Path tempDir;

    @Mock private TempFileManager tempFileManager;

    @InjectMocks private RemoveImagesController controller;

    private void wireTempFileManager() throws IOException {
        lenient()
                .when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        inv -> Files.createTempFile(tempDir, "test", inv.getArgument(0)).toFile());
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(tempDir, "managed", inv.getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    private MockMultipartFile createPdfWithImages(int imagesPerPage, int pages) throws IOException {
        Path path = tempDir.resolve("with-images.pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int p = 0; p < pages; p++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    for (int i = 0; i < imagesPerPage; i++) {
                        BufferedImage img = new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB);
                        PDImageXObject pdImage = JPEGFactory.createFromImage(doc, img);
                        cs.drawImage(pdImage, 50f + i * 30, 600f, 25f, 25f);
                    }
                }
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "with-images.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(path));
    }

    private MockMultipartFile createTextOnlyPdf(int pages) throws IOException {
        Path path = tempDir.resolve("text-only.pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int p = 0; p < pages; p++) {
                doc.addPage(new PDPage(PDRectangle.LETTER));
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "text-only.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(path));
    }

    // PDFBox oracle: walk every page (and nested forms) and count remaining image XObjects.
    private int countImagesInDocument(byte[] pdfBytes) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            int total = 0;
            for (PDPage page : doc.getPages()) {
                total += countImagesInResources(page.getResources());
            }
            return total;
        }
    }

    private int countImagesInResources(PDResources resources) throws IOException {
        if (resources == null) {
            return 0;
        }
        int count = 0;
        for (COSName name : resources.getXObjectNames()) {
            PDXObject xo = resources.getXObject(name);
            if (xo instanceof PDImageXObject) {
                count++;
            } else if (xo instanceof PDFormXObject form) {
                count += countImagesInResources(form.getResources());
            }
        }
        return count;
    }

    @Test
    void removeImages_withImages_strippedOnRender() throws IOException {
        wireTempFileManager();
        MockMultipartFile file = createPdfWithImages(2, 2);
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        int before = countImagesInDocument(file.getBytes());
        assertThat(before).isEqualTo(4);

        ResponseEntity<Resource> response = controller.removeImages(request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        try (InputStream in = response.getBody().getInputStream()) {
            byte[] outBytes = in.readAllBytes();
            try (PDDocument out = Loader.loadPDF(outBytes)) {
                assertThat(out.getNumberOfPages()).isEqualTo(2);
                for (PDPage page : out.getPages()) {
                    int residualOnPage = countImagesInResources(page.getResources());
                    assertThat(residualOnPage).isZero();
                }
            }
        }
    }

    @Test
    void removeImages_textOnlyPdf_returnsValidPdf() throws IOException {
        wireTempFileManager();
        MockMultipartFile file = createTextOnlyPdf(3);
        PDFFile request = new PDFFile();
        request.setFileInput(file);

        ResponseEntity<Resource> response = controller.removeImages(request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        try (InputStream in = response.getBody().getInputStream()) {
            byte[] outBytes = in.readAllBytes();
            try (PDDocument out = Loader.loadPDF(outBytes)) {
                assertThat(out.getNumberOfPages()).isEqualTo(3);
            }
        }
    }

    @Test
    void removeImages_corruptedInput_throws() throws IOException {
        wireTempFileManager();
        MockMultipartFile bad =
                new MockMultipartFile(
                        "fileInput",
                        "broken.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        "not a real pdf".getBytes());
        PDFFile request = new PDFFile();
        request.setFileInput(bad);

        assertThatThrownBy(() -> controller.removeImages(request)).isInstanceOf(IOException.class);
    }
}
