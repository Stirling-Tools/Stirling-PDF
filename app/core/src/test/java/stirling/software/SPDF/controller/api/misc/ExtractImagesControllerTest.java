package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
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
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
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

    private byte[] createPdfWithImageBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            BufferedImage img = new BufferedImage(50, 50, BufferedImage.TYPE_INT_RGB);
            PDImageXObject pdImage = JPEGFactory.createFromImage(doc, img);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(pdImage, 50, 600, 100, 100);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] createEmptyPdfBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Test
    void extractImages_withImage_returnsZip() throws IOException {
        byte[] bytes = createPdfWithImageBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        Response response = controller.extractImages(file, null, "png");

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void extractImages_emptyPdf_returnsZip() throws IOException {
        byte[] bytes = createEmptyPdfBytes();
        FileUpload file = TestFileUploads.of(bytes, "empty.pdf", "application/pdf");

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        Response response = controller.extractImages(file, null, "png");

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void extractImages_jpegFormat() throws IOException {
        byte[] bytes = createPdfWithImageBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        Response response = controller.extractImages(file, null, "jpeg");

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void extractImages_ioException() throws IOException {
        byte[] bytes = createPdfWithImageBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenThrow(new IOException("load error"));
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        assertThatThrownBy(() -> controller.extractImages(file, null, "png"))
                .isInstanceOf(IOException.class);
    }

    @Test
    void extractImages_gifFormat() throws IOException {
        byte[] bytes = createPdfWithImageBytes();
        FileUpload file = TestFileUploads.pdf(bytes);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(bytes));
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        Response response = controller.extractImages(file, null, "gif");

        assertThat(response.getStatus()).isEqualTo(200);
    }
}
