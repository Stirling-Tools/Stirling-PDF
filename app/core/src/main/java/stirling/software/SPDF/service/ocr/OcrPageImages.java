package stirling.software.SPDF.service.ocr;

import static org.bytedeco.leptonica.global.leptonica.pixCreate;
import static org.bytedeco.leptonica.global.leptonica.pixGetData;
import static org.bytedeco.leptonica.global.leptonica.pixGetDepth;
import static org.bytedeco.leptonica.global.leptonica.pixGetHeight;
import static org.bytedeco.leptonica.global.leptonica.pixGetWidth;
import static org.bytedeco.leptonica.global.leptonica.pixGetWpl;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;

import org.bytedeco.javacpp.IntPointer;
import org.bytedeco.leptonica.PIX;

/**
 * Moves page pixels between pdfium's RGBA output, Leptonica and Java images. Leptonica packs each
 * 32-bit word with the leftmost pixel in the most significant byte, and stores RGB as 0xRRGGBB00,
 * so pages are copied word by word rather than through an encoded file.
 */
final class OcrPageImages {

    private OcrPageImages() {}

    /** A replacement page image, already encoded off the PDFBox thread. */
    record Encoded(byte[] jpeg, BufferedImage bilevel) {}

    /** pdfium leaves transparent areas unpainted, so alpha is composited onto white. */
    static byte[] luma(byte[] rgba, int width, int height) {
        byte[] gray = new byte[width * height];
        for (int i = 0, p = 0; i < gray.length; i++, p += 4) {
            int a = rgba[p + 3] & 0xff;
            int v =
                    ((rgba[p] & 0xff) * 299
                                    + (rgba[p + 1] & 0xff) * 587
                                    + (rgba[p + 2] & 0xff) * 114)
                            / 1000;
            gray[i] = (byte) ((v * a + 255 * (255 - a)) / 255);
        }
        return gray;
    }

    static PIX grayPix(byte[] gray, int width, int height) {
        PIX pix = pixCreate(width, height, 8);
        if (pix == null) return null;
        int wpl = pixGetWpl(pix);
        IntPointer data = pixGetData(pix);
        int[] words = new int[wpl];
        for (int y = 0; y < height; y++) {
            Arrays.fill(words, 0);
            int row = y * width;
            for (int x = 0; x < width; x++) {
                words[x >> 2] |= (gray[row + x] & 0xff) << (24 - 8 * (x & 3));
            }
            data.position((long) y * wpl).put(words, 0, wpl);
        }
        return pix;
    }

    static PIX rgbPix(byte[] rgba, int width, int height) {
        PIX pix = pixCreate(width, height, 32);
        if (pix == null) return null;
        int wpl = pixGetWpl(pix);
        IntPointer data = pixGetData(pix);
        int[] words = new int[wpl];
        for (int y = 0; y < height; y++) {
            for (int x = 0, p = y * width * 4; x < width; x++, p += 4) {
                int a = rgba[p + 3] & 0xff;
                int r = ((rgba[p] & 0xff) * a + 255 * (255 - a)) / 255;
                int g = ((rgba[p + 1] & 0xff) * a + 255 * (255 - a)) / 255;
                int b = ((rgba[p + 2] & 0xff) * a + 255 * (255 - a)) / 255;
                words[x] = (r << 24) | (g << 16) | (b << 8);
            }
            data.position((long) y * wpl).put(words, 0, wpl);
        }
        return pix;
    }

    /** Back to a Java image, for when the page itself is replaced by what was OCRed. */
    static BufferedImage toImage(PIX pix) {
        int width = pixGetWidth(pix);
        int height = pixGetHeight(pix);
        int depth = pixGetDepth(pix);
        int wpl = pixGetWpl(pix);
        IntPointer data = pixGetData(pix);
        int[] words = new int[wpl];
        if (depth == 8) {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
            byte[] row = new byte[width];
            for (int y = 0; y < height; y++) {
                data.position((long) y * wpl).get(words, 0, wpl);
                for (int x = 0; x < width; x++) {
                    row[x] = (byte) (words[x >> 2] >>> (24 - 8 * (x & 3)));
                }
                image.getRaster().setDataElements(0, y, width, 1, row);
            }
            return image;
        }
        if (depth != 32) {
            throw new IllegalArgumentException("Unsupported page depth " + depth);
        }
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        int[] row = new int[width];
        for (int y = 0; y < height; y++) {
            data.position((long) y * wpl).get(words, 0, wpl);
            for (int x = 0; x < width; x++) row[x] = words[x] >>> 8;
            image.setRGB(0, y, width, 1, row, 0, width);
        }
        return image;
    }

    /**
     * Picks the encoding OCRmyPDF would: 1-bit for black-and-white pages, greyscale JPEG for grey
     * ones, colour JPEG otherwise. Rasterising text-only pages as colour JPEG made force-OCR output
     * larger than its input.
     */
    static Encoded encode(BufferedImage image) throws IOException {
        int width = image.getWidth();
        int height = image.getHeight();
        boolean color = false;
        long extremes = 0;
        int[] row = new int[width];
        for (int y = 0; y < height && !color; y++) {
            image.getRGB(0, y, width, 1, row, 0, width);
            for (int x = 0; x < width; x++) {
                int r = (row[x] >> 16) & 0xff, g = (row[x] >> 8) & 0xff, b = row[x] & 0xff;
                if (Math.abs(r - g) > 8 || Math.abs(g - b) > 8 || Math.abs(r - b) > 8) {
                    color = true;
                    break;
                }
                if (g < 40 || g > 215) extremes++;
            }
        }
        if (!color && extremes >= (long) width * height * 995 / 1000) {
            BufferedImage bilevel =
                    new BufferedImage(width, height, BufferedImage.TYPE_BYTE_BINARY);
            bilevel.getGraphics().drawImage(image, 0, 0, null);
            return new Encoded(null, bilevel);
        }
        BufferedImage target = image;
        if (!color && image.getType() != BufferedImage.TYPE_BYTE_GRAY) {
            target = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
            target.getGraphics().drawImage(image, 0, 0, null);
        }
        return new Encoded(jpeg(target, 0.85f), null);
    }

    private static byte[] jpeg(BufferedImage image, float quality) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (MemoryCacheImageOutputStream stream = new MemoryCacheImageOutputStream(out)) {
            writer.setOutput(stream);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(quality);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }
}
