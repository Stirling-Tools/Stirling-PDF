package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

class ImageProcessingUtilsTest {

    // A valid PNG whose IHDR declares w x h; the header alone drives the dimension guard.
    private static byte[] pngHeader(int w, int h) throws IOException {
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        DataOutputStream out = new DataOutputStream(png);
        out.write(new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'});
        ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
        DataOutputStream ih = new DataOutputStream(ihdr);
        ih.writeInt(w);
        ih.writeInt(h);
        ih.write(new byte[] {8, 2, 0, 0, 0});
        writeChunk(out, "IHDR", ihdr.toByteArray());
        writeChunk(out, "IEND", new byte[0]);
        return png.toByteArray();
    }

    private static void writeChunk(DataOutputStream out, String type, byte[] data)
            throws IOException {
        CRC32 crc = new CRC32();
        crc.update(type.getBytes(StandardCharsets.ISO_8859_1));
        crc.update(data);
        out.writeInt(data.length);
        out.writeBytes(type);
        out.write(data);
        out.writeInt((int) crc.getValue());
    }

    @Test
    void assertWithinPixelLimit_withinLimit_passes() throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB), "png", bos);
        assertDoesNotThrow(() -> ImageProcessingUtils.assertWithinPixelLimit(bos.toByteArray()));
    }

    @Test
    void assertWithinPixelLimit_oversized_throws() throws IOException {
        byte[] bomb = pngHeader(20000, 20000); // 400 Mpx, over the 100 Mpx cap
        assertThrows(
                IllegalArgumentException.class,
                () -> ImageProcessingUtils.assertWithinPixelLimit(bomb));
    }

    @Test
    void assertWithinPixelLimit_nullBytes_passes() {
        assertDoesNotThrow(() -> ImageProcessingUtils.assertWithinPixelLimit((byte[]) null));
    }

    @Test
    void assertWithinPixelLimit_nonImageBytes_passes() {
        // No reader claims it, so the guard defers to the normal decode path's own error.
        byte[] notAnImage = "not an image".getBytes(StandardCharsets.UTF_8);
        assertDoesNotThrow(() -> ImageProcessingUtils.assertWithinPixelLimit(notAnImage));
    }

    @Test
    void convertColorType_greyscale_returnsGrayscaleImage() {
        BufferedImage source = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        BufferedImage result = ImageProcessingUtils.convertColorType(source, "greyscale");
        assertEquals(BufferedImage.TYPE_BYTE_GRAY, result.getType());
        assertEquals(10, result.getWidth());
        assertEquals(10, result.getHeight());
    }

    @Test
    void convertColorType_blackwhite_returnsBinaryImage() {
        BufferedImage source = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        BufferedImage result = ImageProcessingUtils.convertColorType(source, "blackwhite");
        assertEquals(BufferedImage.TYPE_BYTE_BINARY, result.getType());
    }

    @Test
    void convertColorType_fullColor_returnsSameImage() {
        BufferedImage source = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        BufferedImage result = ImageProcessingUtils.convertColorType(source, "fullcolor");
        assertSame(source, result);
    }

    @Test
    void convertColorType_unknownType_returnsSameImage() {
        BufferedImage source = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        BufferedImage result = ImageProcessingUtils.convertColorType(source, "something_else");
        assertSame(source, result);
    }

    @Test
    void getImageData_byteBuffer_returnsCorrectData() {
        BufferedImage image = new BufferedImage(2, 2, BufferedImage.TYPE_BYTE_GRAY);
        byte[] data = ImageProcessingUtils.getImageData(image);
        assertNotNull(data);
        assertTrue(data instanceof byte[]);
        // TYPE_BYTE_GRAY uses DataBufferByte
        assertTrue(image.getRaster().getDataBuffer() instanceof DataBufferByte);
    }

    @Test
    void getImageData_intBuffer_returnsCorrectLength() {
        BufferedImage image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        // TYPE_INT_RGB uses DataBufferInt
        assertTrue(image.getRaster().getDataBuffer() instanceof DataBufferInt);
        byte[] data = ImageProcessingUtils.getImageData(image);
        assertNotNull(data);
        // 2x2 pixels, 4 bytes per int
        assertEquals(2 * 2 * 4, data.length);
    }

    @Test
    void getImageData_ushortBuffer_returnsRGBData() {
        // TYPE_USHORT_GRAY uses DataBufferUShort which hits the else branch
        BufferedImage image = new BufferedImage(2, 2, BufferedImage.TYPE_USHORT_GRAY);
        byte[] data = ImageProcessingUtils.getImageData(image);
        assertNotNull(data);
        // 2x2 pixels, 3 bytes per pixel (RGB)
        assertEquals(2 * 2 * 3, data.length);
    }

    @Test
    void applyOrientation_zeroRotation_returnsSameImage() {
        BufferedImage image = new BufferedImage(10, 20, BufferedImage.TYPE_INT_RGB);
        BufferedImage result = ImageProcessingUtils.applyOrientation(image, 0);
        assertSame(image, result);
    }

    @Test
    void applyOrientation_90degrees_returnsRotatedImage() {
        BufferedImage image = new BufferedImage(10, 20, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, 10, 20);
        g.dispose();

        BufferedImage result = ImageProcessingUtils.applyOrientation(image, 90);
        assertNotNull(result);
        // The rotated image should have non-zero dimensions
        assertTrue(result.getWidth() > 0);
        assertTrue(result.getHeight() > 0);
    }

    @Test
    void applyOrientation_180degrees_returnsRotatedImage() {
        BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
        BufferedImage result = ImageProcessingUtils.applyOrientation(image, 180);
        assertNotNull(result);
    }

    @Test
    void applyOrientation_270degrees_returnsRotatedImage() {
        BufferedImage image = new BufferedImage(10, 20, BufferedImage.TYPE_INT_RGB);
        BufferedImage result = ImageProcessingUtils.applyOrientation(image, 270);
        assertNotNull(result);
    }
}
