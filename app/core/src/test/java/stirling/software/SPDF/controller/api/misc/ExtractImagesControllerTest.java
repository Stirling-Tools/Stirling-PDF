package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
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
import org.mockito.MockedStatic;
import org.mockito.Mockito;
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

    private MockMultipartFile createPdfRepeatingOneImage(int pageCount) throws IOException {
        Path path = tempDir.resolve("repeated.pdf");
        try (PDDocument doc = new PDDocument()) {
            BufferedImage img = new BufferedImage(60, 40, BufferedImage.TYPE_INT_RGB);
            img.createGraphics().fillRect(0, 0, 60, 40);
            PDImageXObject pdImage = JPEGFactory.createFromImage(doc, img);
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(pdImage, 50, 600, 100, 100);
                }
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "repeated.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(path));
    }

    private MockMultipartFile createPdfWithDistinctImages(int count) throws IOException {
        Path path = tempDir.resolve("distinct.pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < count; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                BufferedImage img = new BufferedImage(60, 40, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = img.createGraphics();
                g.setColor(new Color(20 + i * 70, 40 + i * 50, 200 - i * 60));
                g.fillRect(0, 0, 60, 40);
                g.dispose();
                PDImageXObject pdImage = JPEGFactory.createFromImage(doc, img);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(pdImage, 50, 600, 100, 100);
                }
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "distinct.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(path));
    }

    private List<String> extractedEntryNames(MockMultipartFile file, String format)
            throws IOException {
        return new ArrayList<>(extractedEntries(file, format).keySet());
    }

    private Map<String, byte[]> extractedEntries(MockMultipartFile file, String format)
            throws IOException {
        PDFExtractImagesRequest request = new PDFExtractImagesRequest();
        request.setFileInput(file);
        request.setFormat(format);

        when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        var response = controller.extractImages(request);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (ZipInputStream zis = new ZipInputStream(response.getBody().getInputStream())) {
            for (ZipEntry entry = zis.getNextEntry(); entry != null; entry = zis.getNextEntry()) {
                entries.put(entry.getName(), zis.readAllBytes());
            }
        }
        return entries;
    }

    /**
     * The image carries an object graph too large to fingerprint, so extraction falls back to
     * identity rather than treating every occurrence as a new image.
     */
    private MockMultipartFile createPdfWithUnfingerprintableImage(int pageCount)
            throws IOException {
        Path path = tempDir.resolve("unfingerprintable.pdf");
        try (PDDocument doc = new PDDocument()) {
            BufferedImage img = new BufferedImage(60, 40, BufferedImage.TYPE_INT_RGB);
            PDImageXObject pdImage = JPEGFactory.createFromImage(doc, img);
            COSDictionary oversized = new COSDictionary();
            for (int i = 0; i < 5000; i++) {
                oversized.setInt(COSName.getPDFName("K" + i), i);
            }
            pdImage.getCOSObject().setItem(COSName.DECODE_PARMS, oversized);
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(pdImage, 50, 600, 100, 100);
                }
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "unfingerprintable.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(path));
    }

    /**
     * Byte-identical images embedded as separate COS objects, as merging two PDFs produces. Each
     * page gets its own PDImageXObject, so identity-based dedup sees them as distinct.
     */
    private MockMultipartFile createPdfWithDuplicatedImageObjects(int pageCount)
            throws IOException {
        Path path = tempDir.resolve("duplicated.pdf");
        BufferedImage img = new BufferedImage(60, 40, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(30, 90, 180));
        g.fillRect(0, 0, 60, 40);
        g.dispose();

        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                PDImageXObject pdImage = JPEGFactory.createFromImage(doc, img);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(pdImage, 50, 600, 100, 100);
                }
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "duplicated.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(path));
    }

    @Test
    void extractImages_sameImageOnEveryPage_extractedOnce() throws IOException {
        assertThat(extractedEntryNames(createPdfRepeatingOneImage(5), "png")).hasSize(1);
    }

    @Test
    void extractImages_duplicatedImageObjects_extractedOnce() throws IOException {
        assertThat(extractedEntryNames(createPdfWithDuplicatedImageObjects(4), "png")).hasSize(1);
    }

    @Test
    void extractImages_unfingerprintableImageOnEveryPage_extractedOnce() throws IOException {
        assertThat(extractedEntryNames(createPdfWithUnfingerprintableImage(5), "png")).hasSize(1);
    }

    @Test
    void extractImages_sameImageOnEveryPage_fingerprintedOncePerDocument() throws IOException {
        MockMultipartFile file = createPdfRepeatingOneImage(6);
        PDFExtractImagesRequest request = new PDFExtractImagesRequest();
        request.setFileInput(file);
        request.setFormat("png");

        when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> createTempFile(inv.getArgument(0)));

        try (MockedStatic<MessageDigest> digests =
                mockStatic(MessageDigest.class, Mockito.CALLS_REAL_METHODS)) {
            controller.extractImages(request);
            digests.verify(() -> MessageDigest.getInstance("SHA-256"), times(1));
        }
    }

    @Test
    void extractImages_writesReadableImageOfSourceSize() throws IOException {
        Map<String, byte[]> entries = extractedEntries(createPdfRepeatingOneImage(2), "png");
        assertThat(entries).hasSize(1);

        byte[] written = entries.values().iterator().next();
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(written));
        assertThat(image).isNotNull();
        assertThat(image.getWidth()).isEqualTo(60);
        assertThat(image.getHeight()).isEqualTo(40);
    }

    @Test
    void extractImages_distinctImages_allExtracted() throws IOException {
        assertThat(extractedEntryNames(createPdfWithDistinctImages(3), "png")).hasSize(3);
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
