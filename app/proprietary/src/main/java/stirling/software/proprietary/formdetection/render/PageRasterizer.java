package stirling.software.proprietary.formdetection.render;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.stereotype.Service;

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
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PageRasterizer {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

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

    public List<RasterPage> rasterize(byte[] pdfBytes, int inputSize) {
        List<RasterPage> pages = new ArrayList<>();
        try (PdfDocument doc = PdfDocument.open(pdfBytes);
                PDDocument boxDoc = openForGeometry(pdfBytes)) {
            int count = doc.pageCount();
            for (int i = 0; i < count; i++) {
                try (PdfPage page = doc.page(i)) {
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
                    if (boxDoc != null && i < boxDoc.getNumberOfPages()) {
                        PDPage boxPage = boxDoc.getPage(i);
                        rotation = normalizeRotation(boxPage.getRotation());
                        PDRectangle crop = boxPage.getCropBox();
                        userW = crop.getWidth();
                        userH = crop.getHeight();
                        llx = crop.getLowerLeftX();
                        lly = crop.getLowerLeftY();
                    } else if (boxDoc == null) {
                        log.warn(
                                "Page geometry unavailable; assuming unrotated page with origin"
                                        + " (0,0)");
                    }

                    pages.add(
                            new RasterPage(
                                    i,
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
                                    lly));
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read PDF geometry", e);
        }
        return pages;
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
