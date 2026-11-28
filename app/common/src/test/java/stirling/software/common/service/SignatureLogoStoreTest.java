package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.file.Path;
import java.util.zip.CRC32;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SignatureLogoStoreTest {

    @TempDir Path dir;

    private SignatureLogoStore store() {
        return new SignatureLogoStore(dir.resolve("signature").resolve("logo.png"));
    }

    private static byte[] image(String format, int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, format, out);
        return out.toByteArray();
    }

    @Test
    void untilALogoIsSavedTheBundledStirlingLogoIsUsed() throws Exception {
        SignatureLogoStore store = store();
        assertTrue(store.read().isEmpty());
        BufferedImage bundled = ImageIO.read(new ByteArrayInputStream(store.effective()));
        assertEquals(512, bundled.getHeight());
    }

    @Test
    void anUploadedLogoIsTheOneUsed() throws Exception {
        SignatureLogoStore store = store();
        store.save(image("png", 30, 10));
        assertEquals(30, ImageIO.read(new ByteArrayInputStream(store.effective())).getWidth());
    }

    @Test
    void aJpegIsStoredAsAPngOfTheSameSize() throws Exception {
        SignatureLogoStore store = store();
        store.save(image("jpg", 120, 40));

        byte[] stored = store.read().orElseThrow();
        assertEquals((byte) 0x89, stored[0]);
        BufferedImage read = ImageIO.read(new ByteArrayInputStream(stored));
        assertEquals(120, read.getWidth());
        assertEquals(40, read.getHeight());
    }

    @Test
    void savingAgainReplacesTheLogoAndDeleteRemovesIt() throws Exception {
        SignatureLogoStore store = store();
        store.save(image("png", 10, 10));
        store.save(image("png", 30, 10));
        assertEquals(30, ImageIO.read(new ByteArrayInputStream(store.read().get())).getWidth());

        store.delete();
        assertTrue(store.read().isEmpty());
        assertEquals(0, dir.resolve("signature").toFile().list().length);
    }

    @Test
    void anythingButAPngOrJpegIsRefused() throws Exception {
        SignatureLogoStore store = store();
        IllegalArgumentException error =
                assertThrows(IllegalArgumentException.class, () -> store.save(image("gif", 5, 5)));
        assertTrue(error.getMessage().contains("PNG or JPEG"), error.getMessage());
        assertThrows(IllegalArgumentException.class, () -> store.save(new byte[0]));
        assertTrue(store.read().isEmpty());
    }

    @Test
    void aFileOverTwoMegabytesIsRefused() throws Exception {
        byte[] large = new byte[SignatureLogoStore.MAX_UPLOAD_BYTES + 1];
        System.arraycopy(image("png", 1, 1), 0, large, 0, 8);
        IllegalArgumentException error =
                assertThrows(IllegalArgumentException.class, () -> store().save(large));
        assertTrue(error.getMessage().contains("2 MB"), error.getMessage());
    }

    @Test
    void anUploadDeclaredOverTwoMegabytesIsRefusedBeforeItIsRead() {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                SignatureLogoStore.requireUploadSize(
                                        SignatureLogoStore.MAX_UPLOAD_BYTES + 1L, "logo"));
        assertTrue(error.getMessage().contains("logo"), error.getMessage());
        SignatureLogoStore.requireUploadSize(SignatureLogoStore.MAX_UPLOAD_BYTES, "logo");
    }

    @Test
    void aHugeCanvasIsRefusedFromItsHeaderBeforeDecoding() throws Exception {
        byte[] png = image("png", 1, 1);
        withHeaderSize(png, 100_000, 100_000);
        IllegalArgumentException error =
                assertThrows(IllegalArgumentException.class, () -> store().save(png));
        assertTrue(error.getMessage().contains("4096"), error.getMessage());
    }

    private static void withHeaderSize(byte[] png, int width, int height) {
        ByteBuffer buffer = ByteBuffer.wrap(png);
        buffer.putInt(16, width);
        buffer.putInt(20, height);
        CRC32 crc = new CRC32();
        crc.update(png, 12, 17); // "IHDR" plus its 13 data bytes
        buffer.putInt(29, (int) crc.getValue());
    }
}
