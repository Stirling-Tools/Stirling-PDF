package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.rendering.RenderDestination;

/**
 * A {@link PDFRenderer} that refuses a page whose raster would exceed {@link ImageMemoryLimit}. Use
 * it for every page render: every {@code renderImage} and {@code renderImageWithDPI} overload
 * reaches the one overridden here.
 */
public class LimitedPDFRenderer extends PDFRenderer {

    public LimitedPDFRenderer(PDDocument document) {
        super(document);
    }

    @Override
    public BufferedImage renderImage(
            int pageIndex, float scale, ImageType imageType, RenderDestination destination)
            throws IOException {
        ImageMemoryLimit.requirePageFits(document.getPage(pageIndex), pageIndex + 1, scale);
        return super.renderImage(pageIndex, scale, imageType, destination);
    }
}
