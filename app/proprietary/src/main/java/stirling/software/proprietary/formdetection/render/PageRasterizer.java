package stirling.software.proprietary.formdetection.render;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

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
 */
@Slf4j
@Service
public class PageRasterizer {

    /** A rendered page: RGBA pixels plus the page size (points) and px-per-point scale. */
    public record RasterPage(
            int pageIndex,
            byte[] rgba,
            int widthPx,
            int heightPx,
            float pageWidthPt,
            float pageHeightPt,
            float scaleX,
            float scaleY) {}

    public List<RasterPage> rasterize(byte[] pdfBytes, int inputSize) {
        List<RasterPage> pages = new ArrayList<>();
        try (PdfDocument doc = PdfDocument.open(pdfBytes)) {
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
                    pages.add(
                            new RasterPage(
                                    i,
                                    r.rgba(),
                                    r.width(),
                                    r.height(),
                                    size.width(),
                                    size.height(),
                                    scaleX,
                                    scaleY));
                }
            }
        }
        return pages;
    }
}
