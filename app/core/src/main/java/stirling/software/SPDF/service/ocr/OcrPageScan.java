package stirling.software.SPDF.service.ocr;

import java.io.IOException;
import java.util.OptionalInt;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.util.Matrix;
import org.apache.pdfbox.util.Vector;

import stirling.software.SPDF.pdf.parser.PageImageLocator;

/**
 * Finds the resolution of a scanned page, so a page OCR replaces keeps it: a 100 DPI scan must not
 * come back as a 300 DPI image several times its size. A page counts as a scan when its images
 * cover at least {@link #FULL_PAGE} of it and it shows no text; invisible text, such as an earlier
 * OCR layer, does not count. Pages with visible text keep the OCR resolution, because rasterising
 * their text at a low scan's DPI would make it unreadable.
 */
final class OcrPageScan extends PageImageLocator {

    static final double FULL_PAGE = 0.9;

    /** Images smaller than this share of the page cannot set its DPI. */
    private static final double MIN_IMAGE_SHARE = 0.01;

    private boolean visibleText;

    private OcrPageScan(PDPage page) {
        super(page, 0);
    }

    /** The DPI of the scan filling {@code page}, the highest when several images fill it. */
    static OptionalInt scanDpi(PDPage page) throws IOException {
        OcrPageScan scan = new OcrPageScan(page);
        scan.processPage(page);
        if (scan.visibleText) return OptionalInt.empty();
        PDRectangle crop = page.getCropBox();
        double pageArea = (double) crop.getWidth() * crop.getHeight();
        double covered = 0;
        double dpi = 0;
        for (ImageBox box : scan.getImageBoxes()) {
            double width =
                    Math.min(box.x2(), crop.getUpperRightX())
                            - Math.max(box.x1(), crop.getLowerLeftX());
            double height =
                    Math.min(box.y2(), crop.getUpperRightY())
                            - Math.max(box.y1(), crop.getLowerLeftY());
            if (width <= 0 || height <= 0 || width * height < pageArea * MIN_IMAGE_SHARE) continue;
            covered += width * height;
            // Area-based, so an image turned by a multiple of 90 degrees measures the same.
            double displayed = (double) (box.x2() - box.x1()) * (box.y2() - box.y1());
            double pixels = (double) box.pixelWidth() * box.pixelHeight();
            dpi = Math.max(dpi, 72 * Math.sqrt(pixels / displayed));
        }
        return covered >= pageArea * FULL_PAGE
                ? OptionalInt.of((int) Math.round(dpi))
                : OptionalInt.empty();
    }

    @Override
    protected void showGlyph(
            Matrix textRenderingMatrix, PDFont font, int code, Vector displacement) {
        RenderingMode mode = getGraphicsState().getTextState().getRenderingMode();
        if (mode.isFill() || mode.isStroke()) visibleText = true;
    }
}
