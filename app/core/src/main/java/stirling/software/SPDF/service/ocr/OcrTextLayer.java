package stirling.software.SPDF.service.ocr;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.util.Matrix;

/**
 * Places OCR output onto original pages the way OCRmyPDF's sandwich renderer does: Tesseract's
 * text-only page is drawn as a form over the page, so the page's own content is untouched. OCR runs
 * on the page as rendered (crop box, /Rotate applied), so everything drawn here goes through {@link
 * #displayToUserSpace} to land back in the page's unrotated user space.
 */
public final class OcrTextLayer {

    private OcrTextLayer() {}

    /** Draws {@code textLayer} over the page, stretched to the page's visible area. */
    public static void graft(PDDocument document, PDPage page, PDFormXObject textLayer)
            throws IOException {
        PDRectangle crop = page.getCropBox();
        int rotation = normalizedRotation(page);
        float displayWidth = rotation % 180 == 0 ? crop.getWidth() : crop.getHeight();
        float displayHeight = rotation % 180 == 0 ? crop.getHeight() : crop.getWidth();
        PDRectangle bbox = textLayer.getBBox();
        try (PDPageContentStream content =
                new PDPageContentStream(
                        document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
            content.saveGraphicsState();
            content.transform(displayToUserSpace(crop, rotation));
            content.transform(
                    Matrix.getScaleInstance(
                            displayWidth / bbox.getWidth(), displayHeight / bbox.getHeight()));
            content.transform(
                    Matrix.getTranslateInstance(-bbox.getLowerLeftX(), -bbox.getLowerLeftY()));
            content.drawForm(textLayer);
            content.restoreGraphicsState();
        }
    }

    /**
     * Replaces the page's content with {@code image}, the page as displayed. Force-OCR and deskew
     * do this, as OCRmyPDF does, so the text layer matches what is drawn and text already on the
     * page is not duplicated.
     */
    public static void replaceWithImage(PDDocument document, PDPage page, PDImageXObject image)
            throws IOException {
        PDRectangle crop = page.getCropBox();
        int rotation = normalizedRotation(page);
        float displayWidth = rotation % 180 == 0 ? crop.getWidth() : crop.getHeight();
        float displayHeight = rotation % 180 == 0 ? crop.getHeight() : crop.getWidth();
        page.setResources(new PDResources());
        try (PDPageContentStream content =
                new PDPageContentStream(
                        document, page, PDPageContentStream.AppendMode.OVERWRITE, true)) {
            content.transform(displayToUserSpace(crop, rotation));
            content.drawImage(image, 0, 0, displayWidth, displayHeight);
        }
    }

    /**
     * Maps display space (origin at the bottom-left of the page as viewed, after /Rotate) to the
     * page's user space. /Rotate turns the page clockwise for display, so this undoes that turn.
     */
    static Matrix displayToUserSpace(PDRectangle crop, int rotation) {
        float x = crop.getLowerLeftX();
        float y = crop.getLowerLeftY();
        float w = crop.getWidth();
        float h = crop.getHeight();
        return switch (rotation) {
            case 90 -> new Matrix(0, 1, -1, 0, x + w, y);
            case 180 -> new Matrix(-1, 0, 0, -1, x + w, y + h);
            case 270 -> new Matrix(0, -1, 1, 0, x, y + h);
            default -> new Matrix(1, 0, 0, 1, x, y);
        };
    }

    private static int normalizedRotation(PDPage page) {
        return ((page.getRotation() % 360) + 360) % 360;
    }
}
