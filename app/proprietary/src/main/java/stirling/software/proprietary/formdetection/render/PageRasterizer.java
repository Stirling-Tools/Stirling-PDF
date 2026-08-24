package stirling.software.proprietary.formdetection.render;

import java.io.IOException;
import java.util.function.Consumer;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.stereotype.Service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.model.PageSize;
import stirling.software.jpdfium.model.RenderResult;

/**
 * Renders PDF pages to RGBA bitmaps via JPDFium (the same PDFium engine the browser pipeline uses,
 * for closer parity than PDFBox's Java2D renderer). Each page is rendered at a DPI chosen so its
 * long side is approximately the model input size, minimising any later resampling. The actual
 * pixels-per-point scale is computed from the rendered dimensions so coordinate mapping does not
 * depend on how {@code renderAt} interprets its argument.
 *
 * <p>PDFium renders the page as displayed: /Rotate baked in and the crop box anchored at (0,0). The
 * per-page rotation and crop-box origin needed to map detections back into unrotated user space are
 * not exposed by JPDFium, so they are read from PDFBox alongside the render.
 *
 * <p>Pages are handed to the caller one at a time rather than returned as a list: a rendered page
 * is several megabytes of RGBA, so holding a whole document worth of them at once is enough to
 * exhaust the heap on a large upload.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PageRasterizer {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

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
        try (PdfDocument doc = openForRender(pdfBytes);
                PDDocument boxDoc = openForGeometry(pdfBytes)) {
            int count = pageCount(doc);
            // Checked before the loop: rendering first and counting after would let a huge upload
            // exhaust the heap on its way to being rejected.
            if (count > maxPages) {
                throw new PageLimitExceededException(count, maxPages);
            }
            for (int i = 0; i < count; i++) {
                // Rendered in a helper so a PDFium failure is classified as bad input, while
                // anything the handler throws propagates untouched.
                handler.accept(renderPage(doc, boxDoc, i, inputSize));
            }
        } catch (IOException e) {
            throw new UnreadablePdfException("Failed to read the PDF", e);
        }
    }

    private RasterPage renderPage(PdfDocument doc, PDDocument boxDoc, int index, int inputSize) {
        try (PdfPage page = doc.page(index)) {
            PageSize size = page.size();
            float maxSide = Math.max(size.width(), size.height());
            int dpi = maxSide <= 0 ? 150 : Math.round(72f * inputSize / maxSide);
            dpi = Math.max(36, Math.min(dpi, 300));
            RenderResult r = page.renderAt(dpi);
            float scaleX = size.width() > 0 ? r.width() / size.width() : dpi / 72f;
            float scaleY = size.height() > 0 ? r.height() / size.height() : dpi / 72f;

            int rotation = 0;
            float userW = size.width();
            float userH = size.height();
            float llx = 0;
            float lly = 0;
            if (boxDoc != null && index < boxDoc.getNumberOfPages()) {
                PDPage boxPage = boxDoc.getPage(index);
                rotation = normalizeRotation(boxPage.getRotation());
                PDRectangle crop = boxPage.getCropBox();
                userW = crop.getWidth();
                userH = crop.getHeight();
                llx = crop.getLowerLeftX();
                lly = crop.getLowerLeftY();
            } else if (boxDoc == null) {
                log.warn("Page geometry unavailable; assuming unrotated page with origin (0,0)");
            }

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
                    userW,
                    userH,
                    llx,
                    lly);
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

    private PDDocument openForGeometry(byte[] pdfBytes) {
        try {
            return pdfDocumentFactory.load(pdfBytes);
        } catch (IOException e) {
            log.warn("Could not open PDF with PDFBox for page geometry: {}", e.getMessage());
            return null;
        }
    }

    static int normalizeRotation(int degrees) {
        int r = ((degrees % 360) + 360) % 360;
        // The PDF spec only allows multiples of 90; snap defensively.
        return (r / 90) * 90 % 360;
    }
}
