package stirling.software.SPDF.service.ocr;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.util.Matrix;
import org.apache.pdfbox.util.Vector;

import stirling.software.SPDF.pdf.parser.PageImageLocator;

/**
 * Describes a scanned page, so a page OCR replaces keeps its resolution and, for black-and-white
 * scans, its 1-bit form: a 100 DPI scan must not come back as a 300 DPI image, nor a JBIG2 page as
 * a JPEG, several times its size. A page counts as a scan when its images cover at least {@link
 * #FULL_PAGE} of it and it shows no text; invisible text, such as an earlier OCR layer, does not
 * count. Pages with visible text keep the OCR resolution, because rasterising their text at a low
 * scan's DPI would make it unreadable.
 */
final class OcrPageScan extends PageImageLocator {

    static final double FULL_PAGE = 0.9;

    /** Images smaller than this share of the page cannot set its DPI. */
    private static final double MIN_IMAGE_SHARE = 0.01;

    /**
     * @param dpi the highest DPI among the images filling the page
     * @param bilevel every one of them is 1-bit (JBIG2, CCITT, or any other 1 bpc image or mask)
     */
    record Scan(int dpi, boolean bilevel) {}

    // In the order of getImageBoxes()
    private final List<Boolean> bilevelImages = new ArrayList<>();
    private boolean visibleText;

    private OcrPageScan(PDPage page) {
        super(page, 0);
    }

    static Optional<Scan> scan(PDPage page) throws IOException {
        OcrPageScan scan = new OcrPageScan(page);
        scan.processPage(page);
        if (scan.visibleText) return Optional.empty();
        PDRectangle crop = page.getCropBox();
        double pageArea = (double) crop.getWidth() * crop.getHeight();
        double covered = 0;
        double dpi = 0;
        boolean bilevel = true;
        List<ImageBox> boxes = scan.getImageBoxes();
        for (int i = 0; i < boxes.size(); i++) {
            ImageBox box = boxes.get(i);
            double width =
                    Math.min(box.x2(), crop.getUpperRightX())
                            - Math.max(box.x1(), crop.getLowerLeftX());
            double height =
                    Math.min(box.y2(), crop.getUpperRightY())
                            - Math.max(box.y1(), crop.getLowerLeftY());
            if (width <= 0 || height <= 0 || width * height < pageArea * MIN_IMAGE_SHARE) continue;
            covered += width * height;
            bilevel &= scan.bilevelImages.get(i);
            // Area-based, so an image turned by a multiple of 90 degrees measures the same.
            double displayed = (double) (box.x2() - box.x1()) * (box.y2() - box.y1());
            double pixels = (double) box.pixelWidth() * box.pixelHeight();
            dpi = Math.max(dpi, 72 * Math.sqrt(pixels / displayed));
        }
        return covered >= pageArea * FULL_PAGE
                ? Optional.of(new Scan((int) Math.round(dpi), bilevel))
                : Optional.empty();
    }

    @Override
    public void drawImage(PDImage image) throws IOException {
        super.drawImage(image);
        bilevelImages.add(image.isStencil() || image.getBitsPerComponent() == 1);
    }

    @Override
    protected void showGlyph(
            Matrix textRenderingMatrix, PDFont font, int code, Vector displacement) {
        RenderingMode mode = getGraphicsState().getTextState().getRenderingMode();
        if (mode.isFill() || mode.isStroke()) visibleText = true;
    }
}
