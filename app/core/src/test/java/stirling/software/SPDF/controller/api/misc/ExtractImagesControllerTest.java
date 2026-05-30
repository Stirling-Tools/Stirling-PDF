package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFExtractImagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ExtractImagesControllerTest {

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private ExtractImagesController controller;

    private File createTempFile(String suffix) throws IOException {
        return Files.createTempFile(tempDir, "test", suffix).toFile();
    }

    private MockMultipartFile createPdfWithImage() throws IOException {
        Path path = tempDir.resolve("withimage.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            BufferedImage img = new BufferedImage(50, 50, BufferedImage.TYPE_INT_RGB);
            PDImageXObject pdImage = JPEGFactory.createFromImage(doc, img);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(pdImage, 50, 600, 100, 100);
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, Files.readAllBytes(path));
    }

    private MockMultipartFile createEmptyPdf() throws IOException {
        Path path = tempDir.resolve("empty.pdf");
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "empty.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(path));
    }

    @Test
    void extractImages_withImage_returnsZip() throws IOException {
        MockMultipartFile file = createPdfWithImage();
        PDFExtractImagesRequest request = new PDFExtractImagesRequest();
        request.setFileInput(file);
        request.setFormat("png");

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        var response = controller.extractImages(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void extractImages_emptyPdf_returnsZip() throws IOException {
        MockMultipartFile file = createEmptyPdf();
        PDFExtractImagesRequest request = new PDFExtractImagesRequest();
        request.setFileInput(file);
        request.setFormat("png");

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        var response = controller.extractImages(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void extractImages_jpegFormat() throws IOException {
        MockMultipartFile file = createPdfWithImage();
        PDFExtractImagesRequest request = new PDFExtractImagesRequest();
        request.setFileInput(file);
        request.setFormat("jpeg");

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        var response = controller.extractImages(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void extractImages_ioException() throws IOException {
        MockMultipartFile file = createPdfWithImage();
        PDFExtractImagesRequest request = new PDFExtractImagesRequest();
        request.setFileInput(file);
        request.setFormat("png");

        when(pdfDocumentFactory.load(file)).thenThrow(new IOException("load error"));
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        assertThatThrownBy(() -> controller.extractImages(request)).isInstanceOf(IOException.class);
    }

    @Test
    void extractImages_gifFormat() throws IOException {
        MockMultipartFile file = createPdfWithImage();
        PDFExtractImagesRequest request = new PDFExtractImagesRequest();
        request.setFileInput(file);
        request.setFormat("gif");

        PDDocument doc = Loader.loadPDF(file.getBytes());
        when(pdfDocumentFactory.load(file)).thenReturn(doc);
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        var response = controller.extractImages(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
