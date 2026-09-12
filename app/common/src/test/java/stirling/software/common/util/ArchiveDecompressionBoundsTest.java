package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.service.SsrfProtectionService;

/**
 * Decompression bounds on the untrusted-archive entry points, exercised end to end with real
 * deflate archives rather than through {@link ZipBombGuard} alone.
 */
class ArchiveDecompressionBoundsTest {

    private ApplicationProperties props;
    private TempFileManager tempFileManager;
    private CustomPDFDocumentFactory factory;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("test-archive-");
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
        factory = new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
    }

    /**
     * A PNG whose IHDR declares the given dimensions but whose pixel data is a stub. This is the
     * shape of the decompression bomb: a couple of hundred bytes on the wire, gigabytes once a
     * decoder allocates the raster.
     */
    private static byte[] pngHeaderOnly(int width, int height) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'});
        ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
        writeInt(ihdr, width);
        writeInt(ihdr, height);
        ihdr.write(8);
        ihdr.write(0);
        ihdr.write(0);
        ihdr.write(0);
        ihdr.write(0);
        writeChunk(out, "IHDR", ihdr.toByteArray());
        writeChunk(out, "IDAT", new byte[] {0x78, (byte) 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01});
        writeChunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    private static void writeInt(ByteArrayOutputStream out, int value) {
        out.write((value >>> 24) & 0xFF);
        out.write((value >>> 16) & 0xFF);
        out.write((value >>> 8) & 0xFF);
        out.write(value & 0xFF);
    }

    private static void writeChunk(ByteArrayOutputStream out, String type, byte[] data)
            throws IOException {
        writeInt(out, data.length);
        byte[] typeBytes = type.getBytes(StandardCharsets.US_ASCII);
        out.write(typeBytes);
        out.write(data);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(data);
        writeInt(out, (int) crc.getValue());
    }

    private static byte[] realPng() throws IOException {
        BufferedImage img = new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, 20, 20);
        g.dispose();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "PNG", baos);
        return baos.toByteArray();
    }

    private static byte[] zip(String[] names, byte[][] contents) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (int i = 0; i < names.length; i++) {
                zos.putNextEntry(new ZipEntry(names[i]));
                zos.write(contents[i]);
                zos.closeEntry();
            }
        }
        return baos.toByteArray();
    }

    @Test
    @DisplayName("a header-only image declaring 40000x40000 is over the pixel limit")
    void pixelLimitReadsHeaderWithoutDecoding() throws Exception {
        byte[] bomb = pngHeaderOnly(40000, 40000);
        assertThat(bomb.length).isLessThan(1024);
        assertThat(
                        ImageProcessingUtils.exceedsPixelLimit(
                                bomb, ImageProcessingUtils.MAX_DECODED_IMAGE_PIXELS))
                .isTrue();
        assertThat(
                        ImageProcessingUtils.exceedsPixelLimit(
                                realPng(), ImageProcessingUtils.MAX_DECODED_IMAGE_PIXELS))
                .isFalse();
        assertThat(ImageProcessingUtils.exceedsPixelLimit("not an image".getBytes(), 10)).isFalse();
    }

    @Test
    @DisplayName("a CBZ whose image declares 40000x40000 is rejected before the raster is decoded")
    void cbzPixelBombIsRejected() throws Exception {
        byte[] archive =
                zip(new String[] {"page1.png"}, new byte[][] {pngHeaderOnly(40000, 40000)});
        MultipartFile file =
                new MockMultipartFile("file", "bomb.cbz", "application/x-cbz", archive);

        assertThatThrownBy(() -> CbzUtils.convertCbzToPdf(file, factory, tempFileManager, false))
                .isInstanceOf(ExceptionUtils.CbzFormatException.class)
                .hasCauseInstanceOf(IOException.class)
                .cause()
                .hasMessageContaining("exceeds the maximum decoded size");
    }

    @Test
    @DisplayName("sanitizeHtmlFilesInZip aborts when an entry exceeds the budget")
    void htmlBundleEntryOverBudget() throws Exception {
        byte[] archive =
                zip(
                        new String[] {"index.html"},
                        new byte[][] {"<p>x</p>".repeat(500).getBytes(StandardCharsets.UTF_8)});
        Path zipPath = tempDir.resolve("bundle.zip");
        Files.write(zipPath, archive);

        assertThatThrownBy(
                        () ->
                                FileToPdf.sanitizeHtmlFilesInZip(
                                        zipPath,
                                        tempFileManager,
                                        mock(CustomHtmlSanitizer.class),
                                        new ZipBombGuard.Budget(1000, 1_000_000, 100)))
                .isInstanceOf(ZipBombGuard.ZipBombException.class);
    }

    @Test
    @DisplayName("sanitizeHtmlFilesInZip aborts when a copied entry exceeds the budget")
    void htmlBundleBinaryEntryOverBudget() throws Exception {
        byte[] archive = zip(new String[] {"img.png"}, new byte[][] {new byte[4000]});
        Path zipPath = tempDir.resolve("bundle-binary.zip");
        Files.write(zipPath, archive);

        assertThatThrownBy(
                        () ->
                                FileToPdf.sanitizeHtmlFilesInZip(
                                        zipPath,
                                        tempFileManager,
                                        mock(CustomHtmlSanitizer.class),
                                        new ZipBombGuard.Budget(1000, 1_000_000, 100)))
                .isInstanceOf(ZipBombGuard.ZipBombException.class);
    }

    @Test
    @DisplayName("office sanitization aborts when an entry exceeds the configured limits")
    void officeDocumentEntryOverBudget() throws Exception {
        props.getSystem().getArchiveLimits().setMaxEntryBytes(1000);
        OfficeDocumentSanitizer sanitizer =
                new OfficeDocumentSanitizer(mock(SsrfProtectionService.class), props);
        byte[] archive =
                zip(
                        new String[] {"word/document.xml"},
                        new byte[][] {"<w:p/>".repeat(500).getBytes(StandardCharsets.UTF_8)});

        assertThatThrownBy(() -> sanitizer.sanitize(archive, "docx"))
                .isInstanceOf(ZipBombGuard.ZipBombException.class);
    }

    @Test
    @DisplayName("office sanitization passes an archive that fits the configured limits")
    void officeDocumentWithinBudget() throws Exception {
        OfficeDocumentSanitizer sanitizer =
                new OfficeDocumentSanitizer(mock(SsrfProtectionService.class), props);
        byte[] archive =
                zip(
                        new String[] {"word/document.xml"},
                        new byte[][] {"<w:p/>".getBytes(StandardCharsets.UTF_8)});

        assertThat(sanitizer.sanitize(archive, "docx")).isNotEmpty();
    }

    @Test
    @DisplayName("a limit of zero disables that check")
    void zeroDisablesLimit() throws Exception {
        ApplicationProperties.System.ArchiveLimits limits =
                new ApplicationProperties.System.ArchiveLimits();
        limits.setMaxTotalBytes(0);
        limits.setMaxEntryBytes(0);
        limits.setMaxEntries(0);
        ZipBombGuard.Budget budget = new ZipBombGuard.Budget(limits);
        assertThat(budget.readEntry(new ByteArrayInputStream(new byte[2048]))).hasSize(2048);
        assertThat(budget.readEntry(new ByteArrayInputStream(new byte[2048]))).hasSize(2048);
    }
}
