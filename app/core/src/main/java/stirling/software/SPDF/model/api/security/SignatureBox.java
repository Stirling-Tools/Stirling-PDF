package stirling.software.SPDF.model.api.security;

import org.apache.pdfbox.pdmodel.common.PDRectangle;

/**
 * Where the visible signature sits on the page, expressed the way someone dragging a box on screen
 * thinks about it: {@code y} is measured downwards from the top edge.
 *
 * <p>PDF's own coordinate system runs the other way - the origin is the bottom-left corner and y
 * grows upwards - so every value that reaches PDFBox has to be flipped. Doing that conversion in
 * one place keeps the off-by-a-page-height mistake out of the drawing code.
 *
 * @param x distance in points from the left edge of the page to the left edge of the box
 * @param y distance in points from the top edge of the page to the top edge of the box
 * @param width box width in points
 * @param height box height in points
 */
public record SignatureBox(float x, float y, float width, float height) {

    /** Size used when a request asks for a visible signature without saying how big. */
    public static final float DEFAULT_WIDTH = 200f;

    public static final float DEFAULT_HEIGHT = 50f;

    /**
     * Builds a box from request values, filling in whatever was omitted.
     *
     * @return the requested box, or {@code null} when no position was given at all - callers then
     *     keep the historical bottom-left placement rather than guessing
     */
    public static SignatureBox from(Float x, Float y, Float width, Float height) {
        if (x == null && y == null && width == null && height == null) {
            return null;
        }
        return new SignatureBox(
                x != null ? x : 0f,
                y != null ? y : 0f,
                width != null && width > 0 ? width : DEFAULT_WIDTH,
                height != null && height > 0 ? height : DEFAULT_HEIGHT);
    }

    /**
     * Converts to PDF coordinates and clamps the result inside the page.
     *
     * <p>A box dragged past the edge of the page would otherwise produce a signature that is partly
     * or entirely invisible, which looks to the user like the signature failed. Clamping moves it
     * back inside instead, shrinking it only if it is larger than the page itself.
     *
     * @param mediaBox the page the signature is going on
     */
    public PDRectangle toPdfRectangle(PDRectangle mediaBox) {
        float pageWidth = mediaBox.getWidth();
        float pageHeight = mediaBox.getHeight();

        float boxWidth = Math.min(width, pageWidth);
        float boxHeight = Math.min(height, pageHeight);

        float left = clamp(x, 0f, pageWidth - boxWidth);
        float topDown = clamp(y, 0f, pageHeight - boxHeight);

        // Flip: distance from the top becomes distance from the bottom to the box's lower edge.
        float bottom = pageHeight - topDown - boxHeight;

        return new PDRectangle(
                mediaBox.getLowerLeftX() + left,
                mediaBox.getLowerLeftY() + bottom,
                boxWidth,
                boxHeight);
    }

    private static float clamp(float value, float min, float max) {
        if (max < min) {
            return min;
        }
        return Math.max(min, Math.min(max, value));
    }
}
