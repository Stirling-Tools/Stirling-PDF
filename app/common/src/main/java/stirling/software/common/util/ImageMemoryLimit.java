package stirling.software.common.util;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ExceptionUtils.OutOfMemoryDpiException;

/**
 * The largest raster one render may allocate. The server runs with ExitOnOutOfMemoryError, so a
 * raster that does not fit the heap ends the whole process rather than the request: sizes are
 * checked against this limit before anything is allocated.
 *
 * <p>The limit is {@code system.maxImageMegapixels}, or when that is 0, enough pixels to fill a
 * quarter of the heap, at most 1 GiB.
 */
public final class ImageMemoryLimit {

    /** ARGB, the widest raster PDFBox renders into. */
    static final int BYTES_PER_PIXEL = 4;

    private static final long AUTOMATIC_MAX_BYTES = 1L << 30;

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

    /** Rejects a raster the caller allocates itself, such as a canvas joining several pages. */
    public static void requireImageFits(long width, long height) throws OutOfMemoryDpiException {
        long pixels = width * height;
        long limit = maxPixels();
        if (pixels > limit) {
            throw ExceptionUtils.createCombinedImageTooLargeException(
                    megapixels(pixels), megapixels(limit));
        }
    }

    private static long renderedSide(float points, float scale) {
        return (long) Math.max(Math.floor(points * scale), 1);
    }

    private static long megapixels(long pixels) {
        return Math.ceilDiv(pixels, 1_000_000L);
    }
}
