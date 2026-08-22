package stirling.software.SPDF.model.api.security;

import org.apache.pdfbox.pdmodel.common.PDRectangle;

/**
 * Where the visible signature sits on the page, in PDF user-space points.
 *
 * <p>The origin is the bottom-left corner of the page and y grows upwards, matching PDF itself and
 * the crop endpoint, so a client can feed both from the same coordinate helpers.
 *
 * @param x distance in points from the left edge of the page to the left edge of the box
 * @param y distance in points from the bottom edge of the page to the bottom edge of the box
 * @param width box width in points
 * @param height box height in points
 */
public record SignatureBox(float x, float y, float width, float height) {

    /** Size used when a request asks for a positioned signature without saying how big. */
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
     * Places the box on a page, clamped so it stays inside it.
     *
     * <p>A box dragged past the edge of the page would otherwise produce a signature that is partly
     * or entirely invisible, which reads to the user as the signature having failed. Clamping moves
     * it back inside instead, shrinking it only when it is larger than the page itself.
     *
     * @param mediaBox the page the signature is going on
     */
    public PDRectangle toPdfRectangle(PDRectangle mediaBox) {
        float pageWidth = mediaBox.getWidth();
        float pageHeight = mediaBox.getHeight();

        float boxWidth = Math.min(width, pageWidth);
        float boxHeight = Math.min(height, pageHeight);

        float left = clamp(x, 0f, pageWidth - boxWidth);
        float bottom = clamp(y, 0f, pageHeight - boxHeight);

        // Pages that are cropped or imposed have a media box that does not start at the origin,
        // so the offset has to be carried through or the signature lands in the wrong place.
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
