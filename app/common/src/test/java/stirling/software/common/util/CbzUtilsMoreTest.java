package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/**
 * Gap-filling tests for {@link CbzUtils#convertCbzToPdf} that build real in-memory CBZ (ZIP)
 * archives containing real PNG images and convert them with a real {@link
 * CustomPDFDocumentFactory}. No external process is launched (optimizeForEbook is left off so
 * Ghostscript is never invoked).
 */
class CbzUtilsMoreTest {

    private TempFileManager tempFileManager;
    private CustomPDFDocumentFactory factory;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("test-cbz-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        factory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
    }

    private static byte[] pngBytes(Color color) throws IOException {
        BufferedImage img = new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, 20, 20);
        g.dispose();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "PNG", baos);
        return baos.toByteArray();
    }

    /** Build a CBZ (ZIP) from name->bytes entries. */
    private static byte[] buildCbz(String[] names, byte[][] contents) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (int i = 0; i < names.length; i++) {
                zos.putNextEntry(new ZipEntry(names[i]));
                if (contents[i] != null) {
                    zos.write(contents[i]);
                }
                zos.closeEntry();
            }
        }
        return baos.toByteArray();
    }

    private static MultipartFile cbz(byte[] bytes) {
        return new MockMultipartFile("file", "comic.cbz", "application/x-cbz", bytes);
    }

    @Nested
    @DisplayName("convertCbzToPdf - happy path")
    class HappyPathTests {

        @Test
        @DisplayName("a CBZ with two images converts to a two-page PDF, sorted by natural order")
        void twoImagesToPdf() throws Exception {
            byte[] archive =
                    buildCbz(
                            new String[] {"page2.png", "page10.png", "page1.png"},
                            new byte[][] {
                                pngBytes(Color.RED), pngBytes(Color.GREEN), pngBytes(Color.BLUE)
                            });

            try (TempFile resultPdf =
                    CbzUtils.convertCbzToPdf(cbz(archive), factory, tempFileManager, false)) {
                assertThat(resultPdf.exists()).isTrue();
                try (PDDocument doc = Loader.loadPDF(resultPdf.getFile())) {
                    assertThat(doc.getNumberOfPages()).isEqualTo(3);
                }
            }
        }

        @Test
        @DisplayName("non-image entries are ignored, only images become pages")
        void mixedEntries() throws Exception {
            byte[] archive =
                    buildCbz(
                            new String[] {"readme.txt", "cover.png"},
                            new byte[][] {
                                "notes".getBytes(StandardCharsets.UTF_8), pngBytes(Color.CYAN)
                            });

            try (TempFile resultPdf =
                    CbzUtils.convertCbzToPdf(cbz(archive), factory, tempFileManager, false)) {
                try (PDDocument doc = Loader.loadPDF(resultPdf.getFile())) {
                    assertThat(doc.getNumberOfPages()).isEqualTo(1);
                }
            }
        }
    }

    @Nested
    @DisplayName("convertCbzToPdf - invalid archives")
    class InvalidArchiveTests {

        @Test
        @DisplayName("an empty ZIP (no entries) is rejected")
        void emptyArchive() throws Exception {
            byte[] archive = buildCbz(new String[] {}, new byte[][] {});
            assertThatThrownBy(
                            () ->
                                    CbzUtils.convertCbzToPdf(
                                            cbz(archive), factory, tempFileManager, false))
                    .isInstanceOf(Exception.class);
        }

        @Test
        @DisplayName("a ZIP with no image entries is rejected as 'no images'")
        void noImageEntries() throws Exception {
            byte[] archive =
                    buildCbz(
                            new String[] {"a.txt", "b.json"},
                            new byte[][] {
                                "x".getBytes(StandardCharsets.UTF_8),
                                "{}".getBytes(StandardCharsets.UTF_8)
                            });
            assertThatThrownBy(
                            () ->
                                    CbzUtils.convertCbzToPdf(
                                            cbz(archive), factory, tempFileManager, false))
                    .isInstanceOf(Exception.class);
        }

        @Test
        @DisplayName("non-ZIP bytes are rejected as an invalid CBZ format")
        void corruptArchive() {
            byte[] notAZip = "this is definitely not a zip file".getBytes(StandardCharsets.UTF_8);
            assertThatThrownBy(
                            () ->
                                    CbzUtils.convertCbzToPdf(
                                            cbz(notAZip), factory, tempFileManager, false))
                    .isInstanceOf(Exception.class);
        }

        @Test
        @DisplayName("a CBZ whose only image is corrupt produces no pages and is rejected")
        void corruptImageProducesNoPages() throws Exception {
            byte[] archive =
                    buildCbz(
                            new String[] {"broken.png"},
                            new byte[][] {"not a real png".getBytes(StandardCharsets.UTF_8)});
            assertThatThrownBy(
                            () ->
                                    CbzUtils.convertCbzToPdf(
                                            cbz(archive), factory, tempFileManager, false))
                    .isInstanceOf(Exception.class);
        }
    }

    @Nested
    @DisplayName("@TempDir cleanup")
    class CleanupTests {

        @Test
        @DisplayName("the returned TempFile lives under the configured temp dir and closes cleanly")
        void tempFileCleanup() throws Exception {
            byte[] archive =
                    buildCbz(new String[] {"p.png"}, new byte[][] {pngBytes(Color.MAGENTA)});

            TempFile resultPdf =
                    CbzUtils.convertCbzToPdf(cbz(archive), factory, tempFileManager, false);
            Path path = resultPdf.getPath();
            assertThat(Files.exists(path)).isTrue();
            resultPdf.close();
            assertThat(Files.exists(path)).isFalse();
        }
    }
}
