package stirling.software.common.util;

import java.io.IOException;
import java.io.InputStream;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ExceptionUtils.OutOfMemoryDpiException;

/**
 * The largest raster one render or image decode may allocate. The server runs with
 * ExitOnOutOfMemoryError, so a raster that does not fit the heap ends the whole process rather than
 * the request: sizes are checked against this limit before anything is allocated.
 *
 * <p>The limit is {@code system.maxImageMegapixels}, or when that is 0, enough pixels to fill a
 * quarter of the heap, at most 1 GiB.
 */
public final class ImageMemoryLimit {

    /** ARGB, the widest raster PDFBox renders into. */
    static final int BYTES_PER_PIXEL = 4;

    private static final long AUTOMATIC_MAX_BYTES = 1L << 30;

    /** Codecs whose decoder sizes its raster from the codec header, whatever the PDF declares. */
    private static final Map<COSName, String> SELF_SIZING_CODECS =
            Map.of(COSName.DCT_DECODE, "JPEG", COSName.JPX_DECODE, "JPEG2000");

    private ImageMemoryLimit() {}

    public static long maxPixels() {
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        int configured =
                properties == null || properties.getSystem() == null
                        ? 0
                        : properties.getSystem().getMaxImageMegapixels();
        return maxPixels(configured, Runtime.getRuntime().maxMemory());
    }

    static long maxPixels(int configuredMegapixels, long maxHeapBytes) {
        if (configuredMegapixels > 0) {
            return configuredMegapixels * 1_000_000L;
        }
        return Math.min(maxHeapBytes / 4, AUTOMATIC_MAX_BYTES) / BYTES_PER_PIXEL;
    }

    /**
     * Rejects a page whose render at {@code scale} would exceed the limit. Sized from the crop box
     * exactly as {@link org.apache.pdfbox.rendering.PDFRenderer} sizes it.
     */
    public static void requirePageFits(PDPage page, int pageNumber, float scale)
            throws OutOfMemoryDpiException {
        PDRectangle cropBox = page.getCropBox();
        long pixels =
                renderedSide(cropBox.getWidth(), scale) * renderedSide(cropBox.getHeight(), scale);
        long limit = maxPixels();
        if (pixels > limit) {
            throw ExceptionUtils.createPageImageTooLargeException(
                    pageNumber, Math.round(scale * 72), megapixels(pixels), megapixels(limit));
        }
    }

    /** Rejects a canvas the caller allocates itself to join several pages. */
    public static void requireCombinedImageFits(long width, long height)
            throws OutOfMemoryDpiException {
        long pixels = width * height;
        long limit = maxPixels();
        if (pixels > limit) {
            throw ExceptionUtils.createCombinedImageTooLargeException(
                    megapixels(pixels), megapixels(limit));
        }
    }

    /**
     * Whether {@link PDImageXObject#getImage()} would fit the limit, judged without decoding. Do
     * not call {@code getWidth()}, {@code getHeight()} or {@code getColorSpace()} on an image
     * before this: for JPEG 2000 they decode it in full.
     */
    public static boolean embeddedImageFits(PDImageXObject image) throws IOException {
        return decodedPixels(image) <= maxPixels();
    }

    /** As {@link #embeddedImageFits}, but rejects an image over the limit. */
    public static void requireEmbeddedImageFits(PDImageXObject image) throws IOException {
        long pixels = decodedPixels(image);
        long limit = maxPixels();
        if (pixels > limit) {
            throw ExceptionUtils.createEmbeddedImageTooLargeException(
                    megapixels(pixels), megapixels(limit));
        }
    }

    /** PDFBox scales an image and its mask to the larger of the two before combining them. */
    private static long decodedPixels(PDImageXObject image) throws IOException {
        long width = 0;
        long height = 0;
        for (PDImageXObject part :
                new PDImageXObject[] {image, image.getSoftMask(), image.getMask()}) {
            if (part != null) {
                long[] size = decodedSize(part);
                width = Math.max(width, size[0]);
                height = Math.max(height, size[1]);
            }
        }
        return width * height;
    }

    private static long[] decodedSize(PDImageXObject image) throws IOException {
        COSDictionary dictionary = image.getCOSObject();
        long width = Math.max(dictionary.getInt(COSName.WIDTH, 0), 0);
        long height = Math.max(dictionary.getInt(COSName.HEIGHT, 0), 0);
        long[] codecSize = codecHeaderSize(image);
        if (codecSize != null) {
            width = Math.max(width, codecSize[0]);
            height = Math.max(height, codecSize[1]);
        }
        return new long[] {width, height};
    }

    /** Reads only the codec's header; null when the image's last filter does not size itself. */
    private static long[] codecHeaderSize(PDImageXObject image) throws IOException {
        List<COSName> filters = image.getStream().getFilters();
        if (filters.isEmpty()) {
            return null;
        }
        COSName codec = filters.getLast();
        String format = SELF_SIZING_CODECS.get(codec);
        if (format == null) {
            return null;
        }
        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
        if (!readers.hasNext()) {
            return null;
        }
        ImageReader reader = readers.next();
        try (InputStream encoded = image.getStream().createInputStream(List.of(codec.getName()));
                ImageInputStream input = ImageIO.createImageInputStream(encoded)) {
            // PDFBox's DCTFilter skips one leading line feed; without the same skip the header
            // read would fail on a stream PDFBox goes on to decode.
            if (COSName.DCT_DECODE.equals(codec) && input.read() != 0x0A) {
                input.seek(0);
            }
            reader.setInput(input, true, true);
            return new long[] {reader.getWidth(0), reader.getHeight(0)};
        } catch (IOException | RuntimeException e) {
            // PDFBox's decoder parses the same header first, so it fails before allocating too.
            return null;
        } finally {
            reader.dispose();
        }
    }

    private static long renderedSide(float points, float scale) {
        return (long) Math.max(Math.floor(points * scale), 1);
    }

    private static long megapixels(long pixels) {
        return Math.ceilDiv(pixels, 1_000_000L);
    }
}
