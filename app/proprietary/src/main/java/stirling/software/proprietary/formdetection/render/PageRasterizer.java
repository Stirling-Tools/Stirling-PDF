package stirling.software.proprietary.formdetection.render;

import java.util.function.Consumer;

import org.springframework.stereotype.Service;

import lombok.Getter;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.PdfFormRenderer;
import stirling.software.jpdfium.model.PageSize;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.model.RenderResult;
import stirling.software.jpdfium.transform.PdfPageGeometry;

/**
 * Renders pages to RGBA via JPDFium at roughly the model input size, one at a time so a large
 * document cannot exhaust the heap. Form widgets are painted by {@link PdfFormRenderer}, including
 * widgets without an appearance stream.
 */
@Service
public class PageRasterizer {

    /** The PDF cannot be opened or rendered: a bad request, not an engine failure. */
    public static class UnreadablePdfException extends RuntimeException {
        public UnreadablePdfException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** The document has more pages than the caller allows. Thrown before anything is rendered. */
    @Getter
    public static class PageLimitExceededException extends RuntimeException {
        private final int pageCount;
        private final int limit;

        public PageLimitExceededException(int pageCount, int limit) {
            super("PDF has " + pageCount + " pages; the limit is " + limit);
            this.pageCount = pageCount;
            this.limit = limit;
        }
    }

    /**
     * A rendered page: RGBA pixels in display space (rotation applied, crop-box origin at 0,0) plus
     * the geometry needed to map display-space points back to unrotated user space.
     *
     * @param pageWidthPt display-space width in points (rotated crop box)
     * @param pageHeightPt display-space height in points (rotated crop box)
     * @param scaleX px per display-space point, horizontal
     * @param scaleY px per display-space point, vertical
     * @param rotationDegrees normalized page /Rotate: 0, 90, 180 or 270
     * @param userWidthPt unrotated crop-box width in points
     * @param userHeightPt unrotated crop-box height in points
     * @param cropLlxPt crop-box lower-left x in user space
     * @param cropLlyPt crop-box lower-left y in user space
     */
    public record RasterPage(
            int pageIndex,
            byte[] rgba,
            int widthPx,
            int heightPx,
            float pageWidthPt,
            float pageHeightPt,
            float scaleX,
            float scaleY,
            int rotationDegrees,
            float userWidthPt,
            float userHeightPt,
            float cropLlxPt,
            float cropLlyPt) {}

    /**
     * Render each page in turn and pass it to {@code handler}. Only one page of pixels is reachable
     * at a time, so peak memory is one bitmap rather than the whole document.
     *
     * @param maxPages reject the document if it has more pages than this, before rendering any
     * @throws PageLimitExceededException the document exceeds {@code maxPages}
     * @throws UnreadablePdfException the PDF is empty, corrupt or password-protected
     */
    public void rasterize(
            byte[] pdfBytes, int inputSize, int maxPages, Consumer<RasterPage> handler) {
        if (pdfBytes == null || pdfBytes.length == 0) {
            throw new UnreadablePdfException("The uploaded file is empty", null);
        }
        try (PdfDocument doc = openForRender(pdfBytes)) {
            int count = pageCount(doc);
            // Checked before the loop: rendering first and counting after would let a huge upload
            // exhaust the heap on its way to being rejected.
            if (count > maxPages) {
                throw new PageLimitExceededException(count, maxPages);
            }
            for (int i = 0; i < count; i++) {
                // Rendered in a helper so a PDFium failure is classified as bad input, while
                // anything the handler throws propagates untouched.
                handler.accept(renderPage(doc, i, inputSize));
            }
        }
    }

    private RasterPage renderPage(PdfDocument doc, int index, int inputSize) {
        try {
            PageSize size;
            Rect cropBox;
            try (PdfPage page = doc.page(index)) {
                size = page.size();
                cropBox = page.getCropBox().orElseGet(page::getMediaBox);
            }
            int rotation = normalizeRotation(PdfPageGeometry.getRotation(doc, index));

            float maxSide = Math.max(size.width(), size.height());
            int dpi = maxSide <= 0 ? 150 : Math.round(72f * inputSize / maxSide);
            dpi = Math.max(36, Math.min(dpi, 300));
            // Form rendering builds widget appearances, so fields that have no /AP stream still
            // reach the detector instead of rendering blank.
            RenderResult r = PdfFormRenderer.renderPage(doc, index, dpi);
            flattenOverWhite(r.rgba());
            float scaleX = size.width() > 0 ? r.width() / size.width() : dpi / 72f;
            float scaleY = size.height() > 0 ? r.height() / size.height() : dpi / 72f;

            return new RasterPage(
                    index,
                    r.rgba(),
                    r.width(),
                    r.height(),
                    size.width(),
                    size.height(),
                    scaleX,
                    scaleY,
                    rotation,
                    cropBox.width(),
                    cropBox.height(),
                    cropBox.x(),
                    cropBox.y());
        } catch (RuntimeException e) {
            throw new UnreadablePdfException("Failed to render page " + (index + 1), e);
        }
    }

    private PdfDocument openForRender(byte[] pdfBytes) {
        try {
            return PdfDocument.open(pdfBytes);
        } catch (Exception e) {
            throw new UnreadablePdfException(
                    "The PDF could not be opened; it may be corrupt or password-protected", e);
        }
    }

    private int pageCount(PdfDocument doc) {
        try {
            return doc.pageCount();
        } catch (RuntimeException e) {
            throw new UnreadablePdfException("The PDF has no readable page tree", e);
        }
    }

    /**
     * Form rendering leaves unpainted page area transparent, while the detector preprocesses by
     * drawing RGBA over its pad colour. Flatten to opaque white so blank areas stay white instead
     * of taking on that pad colour.
     */
    static void flattenOverWhite(byte[] rgba) {
        for (int i = 0; i < rgba.length; i += 4) {
            int alpha = rgba[i + 3] & 0xFF;
            if (alpha == 255) {
                continue;
            }
            int inverse = 255 - alpha;
            rgba[i] = (byte) (((rgba[i] & 0xFF) * alpha + 255 * inverse) / 255);
            rgba[i + 1] = (byte) (((rgba[i + 1] & 0xFF) * alpha + 255 * inverse) / 255);
            rgba[i + 2] = (byte) (((rgba[i + 2] & 0xFF) * alpha + 255 * inverse) / 255);
            rgba[i + 3] = (byte) 255;
        }
    }

    static int normalizeRotation(int degrees) {
        int r = ((degrees % 360) + 360) % 360;
        // The PDF spec only allows multiples of 90; snap defensively.
        return (r / 90) * 90 % 360;
    }
}
