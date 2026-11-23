package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipInputStream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.ExtractImageScansRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ImageMemoryLimit;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.officeconvert.photosplit.PhotoSplitter;

/** Unit tests for {@link ExtractImageScansController}; the in-process splitter is mocked. */
class ExtractImageScansControllerTest {

    private ExtractImageScansController controller;

    @TempDir Path baseTmpDir;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().getTempFileManagement().setBaseTmpDir(baseTmpDir.toString());
        properties.getSystem().getTempFileManagement().setPrefix("scan-test-");
        controller =
                new ExtractImageScansController(
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

    private static byte[] png() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    private static MockMultipartFile pngFile(String name) throws IOException {
        return new MockMultipartFile("fileInput", name, MediaType.IMAGE_PNG_VALUE, png());
    }

    private static MockedStatic<PhotoSplitter> splitterWriting(int count) {
        MockedStatic<PhotoSplitter> splitter = Mockito.mockStatic(PhotoSplitter.class);
        splitter.when(
                        () ->
                                PhotoSplitter.split(
                                        any(Path.class),
                                        any(Path.class),
                                        anyString(),
                                        any(PhotoSplitter.Options.class)))
                .thenAnswer(
                        call -> {
                            Path dir = call.getArgument(1);
                            List<Path> written = new ArrayList<>();
                            for (int i = 1; i <= count; i++) {
                                Path photo = dir.resolve("photo_" + i + ".png");
                                Files.write(photo, png());
                                written.add(photo);
                            }
                            return written;
                        });
        return splitter;
    }

    @Test
    @DisplayName("throws when no photos are found")
    void noPhotos() throws Exception {
        MockMultipartFile png = pngFile("scan.png");
        try (MockedStatic<PhotoSplitter> ignored = splitterWriting(0)) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.extractImageScans(requestFor(png)));
        }
    }

    @Test
    @DisplayName("returns a single PNG when exactly one photo is found")
    void returnsSinglePng() throws Exception {
        MockMultipartFile png = pngFile("scan.png");
        try (MockedStatic<PhotoSplitter> ignored = splitterWriting(1)) {
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
        try (MockedStatic<PhotoSplitter> ignored = splitterWriting(3)) {
            ResponseEntity<Resource> response = controller.extractImageScans(requestFor(png));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            List<String> names = new ArrayList<>();
            try (var in = response.getBody().getInputStream();
                    var zip = new ZipInputStream(in)) {
                for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                    assertNotNull(ImageIO.read(new ByteArrayInputStream(zip.readAllBytes())));
                    names.add(entry.getName());
                }
            }
            assertEquals(
                    List.of("scan_processed_1.png", "scan_processed_2.png", "scan_processed_3.png"),
                    names);
        }
    }

    @Test
    @DisplayName("passes the request parameters and server limits to the splitter")
    void passesOptions() throws Exception {
        ExtractImageScansRequest request = requestFor(pngFile("scan.png"));
        request.setAngleThreshold(7);
        request.setTolerance(21);
        request.setMinArea(9000);
        request.setMinContourArea(600);
        request.setBorderSize(2);
        ArgumentCaptor<PhotoSplitter.Options> options =
                ArgumentCaptor.forClass(PhotoSplitter.Options.class);

        try (MockedStatic<PhotoSplitter> splitter = splitterWriting(1)) {
            controller.extractImageScans(request);
            splitter.verify(
                    () ->
                            PhotoSplitter.split(
                                    any(Path.class),
                                    any(Path.class),
                                    anyString(),
                                    options.capture()));
        }

        PhotoSplitter.Options used = options.getValue();
        assertEquals(7, used.angleThreshold());
        assertEquals(21, used.tolerance());
        assertEquals(9000, used.minArea());
        assertEquals(600, used.minContourArea());
        assertEquals(2, used.borderSize());
        assertEquals(ImageMemoryLimit.maxPixels(), used.maxPixels());
    }

    @Test
    @DisplayName("refuses an image over the server's pixel limit")
    void refusesOversizedImage() throws Exception {
        long limit = ImageMemoryLimit.maxPixels();
        int side = (int) Math.ceil(Math.sqrt(limit)) + 1;
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        png.write(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'});
        ByteArrayOutputStream header = new ByteArrayOutputStream();
        java.io.DataOutputStream ihdr = new java.io.DataOutputStream(header);
        ihdr.writeBytes("IHDR");
        ihdr.writeInt(side);
        ihdr.writeInt(side);
        ihdr.write(new byte[] {8, 2, 0, 0, 0});
        java.util.zip.CRC32 crc = new java.util.zip.CRC32();
        crc.update(header.toByteArray());
        java.io.DataOutputStream out = new java.io.DataOutputStream(png);
        out.writeInt(13);
        out.write(header.toByteArray());
        out.writeInt((int) crc.getValue());
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "huge.png", MediaType.IMAGE_PNG_VALUE, png.toByteArray());

        IOException e =
                assertThrows(
                        IOException.class, () -> controller.extractImageScans(requestFor(file)));
        assertTrue(e.getMessage().contains("the limit is " + limit), e.getMessage());
    }

    @Test
    @DisplayName("leaves no controller temp files behind after a no-photos failure")
    void cleansUpAfterFailure() throws Exception {
        MockMultipartFile png = pngFile("scan.png");
        try (MockedStatic<PhotoSplitter> ignored = splitterWriting(0)) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> controller.extractImageScans(requestFor(png)));
        }
        try (var stream = Files.walk(baseTmpDir)) {
            assertFalse(
                    stream.map(p -> p.getFileName().toString())
                            .anyMatch(n -> n.startsWith("scan-test-")),
                    "controller temp files should be cleaned up");
        }
    }
}
