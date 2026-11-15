package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.zip.ZipInputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.ExtractImageScansRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.officeconvert.photosplit.PhotoSplitter;

/** Unit tests for {@link ExtractImageScansController}; the in-process splitter is mocked. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ExtractImageScansControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    private ExtractImageScansController controller;

    @TempDir Path baseTmpDir;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().getTempFileManagement().setBaseTmpDir(baseTmpDir.toString());
        properties.getSystem().getTempFileManagement().setPrefix("scan-test-");
        controller =
                new ExtractImageScansController(
                        pdfDocumentFactory,
                        new TempFileManager(new TempFileRegistry(), properties));
    }

    private ExtractImageScansRequest requestFor(MockMultipartFile file) {
        ExtractImageScansRequest request = new ExtractImageScansRequest();
        request.setFileInput(file);
        request.setAngleThreshold(5);
        request.setTolerance(20);
        request.setMinArea(8000);
        request.setMinContourArea(500);
        request.setBorderSize(1);
        return request;
    }

    private static MockMultipartFile pngFile(String name) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "png", out);
        return new MockMultipartFile(
                "fileInput", name, MediaType.IMAGE_PNG_VALUE, out.toByteArray());
    }

    private static MockMultipartFile pdfFile() {
        return new MockMultipartFile(
                "fileInput", "scan.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1});
    }

    private static PDDocument singlePageDocument() {
        PDDocument doc = new PDDocument();
        doc.addPage(new PDPage(new PDRectangle(72f, 72f)));
        return doc;
    }

    private static List<PhotoSplitter.Photo> photos(int count) {
        List<PhotoSplitter.Photo> photos = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            photos.add(
                    new PhotoSplitter.Photo(
                            new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), List.of(), 0));
        }
        return photos;
    }

    private static MockedStatic<PhotoSplitter> splitterReturning(int count) {
        List<PhotoSplitter.Photo> found = photos(count);
        MockedStatic<PhotoSplitter> splitter = Mockito.mockStatic(PhotoSplitter.class);
        splitter.when(
                        () ->
                                PhotoSplitter.split(
                                        any(BufferedImage.class), any(PhotoSplitter.Options.class)))
                .thenReturn(found);
        return splitter;
    }

    @Test
    @DisplayName("rejects an image ImageIO cannot read")
    void rejectsUnreadableImage() {
        MockMultipartFile garbage =
                new MockMultipartFile(
                        "fileInput", "scan.png", MediaType.IMAGE_PNG_VALUE, new byte[] {1, 2, 3});

        IllegalArgumentException e =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> controller.extractImageScans(requestFor(garbage)));
        assertEquals("Unsupported image format: png", e.getMessage());
    }

    @Test
    @DisplayName("throws when no photos are found in an image")
    void noPhotosInImage() throws Exception {
        MockMultipartFile png = pngFile("scan.png");
        try (MockedStatic<PhotoSplitter> ignored = splitterReturning(0)) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.extractImageScans(requestFor(png)));
        }
    }

    @Test
    @DisplayName("renders a PDF once and throws when its pages hold no photos")
    void noPhotosInPdf() throws Exception {
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(singlePageDocument());

        try (MockedStatic<PhotoSplitter> splitter = splitterReturning(0)) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.extractImageScans(requestFor(pdfFile())));
            splitter.verify(
                    () ->
                            PhotoSplitter.split(
                                    any(BufferedImage.class), any(PhotoSplitter.Options.class)));
        }
        verify(pdfDocumentFactory, times(1)).load(any(MultipartFile.class));
    }

    @Test
    @DisplayName("returns a single PNG when exactly one photo is found")
    void returnsSinglePng() throws Exception {
        MockMultipartFile png = pngFile("scan.png");
        try (MockedStatic<PhotoSplitter> ignored = splitterReturning(1)) {
            ResponseEntity<Resource> response = controller.extractImageScans(requestFor(png));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
            try (var in = response.getBody().getInputStream()) {
                assertNotNull(ImageIO.read(in));
            }
        }
    }

    @Test
    @DisplayName("returns a zip with one PNG per photo when several are found")
    void returnsZipForMultiplePhotos() throws Exception {
        MockMultipartFile png = pngFile("scan.png");
        try (MockedStatic<PhotoSplitter> ignored = splitterReturning(3)) {
            ResponseEntity<Resource> response = controller.extractImageScans(requestFor(png));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            int entries = 0;
            try (var in = response.getBody().getInputStream();
                    var zip = new ZipInputStream(in)) {
                while (zip.getNextEntry() != null) {
                    assertNotNull(ImageIO.read(new ByteArrayInputStream(zip.readAllBytes())));
                    entries++;
                }
            }
            assertEquals(3, entries);
        }
    }

    @Test
    @DisplayName("passes the request parameters to the splitter")
    void passesOptions() throws Exception {
        ExtractImageScansRequest request = requestFor(pngFile("scan.png"));
        request.setAngleThreshold(7);
        request.setTolerance(21);
        request.setMinArea(9000);
        request.setMinContourArea(600);
        request.setBorderSize(2);
        ArgumentCaptor<PhotoSplitter.Options> options =
                ArgumentCaptor.forClass(PhotoSplitter.Options.class);

        try (MockedStatic<PhotoSplitter> splitter = Mockito.mockStatic(PhotoSplitter.class)) {
            splitter.when(() -> PhotoSplitter.split(any(BufferedImage.class), options.capture()))
                    .thenReturn(Collections.emptyList());

            assertThrows(
                    IllegalArgumentException.class, () -> controller.extractImageScans(request));
        }

        PhotoSplitter.Options used = options.getValue();
        assertEquals(7, used.angleThreshold());
        assertEquals(21, used.tolerance());
        assertEquals(9000, used.minArea());
        assertEquals(600, used.minContourArea());
        assertEquals(2, used.borderSize());
    }

    @Test
    @DisplayName("leaves no controller temp files behind after a no-photos failure")
    void cleansUpAfterFailure() throws Exception {
        MockMultipartFile png = pngFile("scan.png");
        try (MockedStatic<PhotoSplitter> ignored = splitterReturning(0)) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.extractImageScans(requestFor(png)));
        }
        try (var stream = Files.walk(baseTmpDir)) {
            assertFalse(
                    stream.filter(Files::isRegularFile)
                            .map(p -> p.getFileName().toString())
                            .anyMatch(n -> n.startsWith("scan-test-")),
                    "controller temp files should be cleaned up");
        }
    }
}
