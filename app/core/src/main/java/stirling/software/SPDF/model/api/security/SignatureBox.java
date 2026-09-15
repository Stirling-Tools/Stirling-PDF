package stirling.software.SPDF.model.api.security;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;

/**
 * Where the visible signature sits on the page, in PDF user-space points.
 *
 * <p>The origin is the bottom-left corner of the page as the reader sees it, and y grows upwards,
 * matching PDF itself and the crop endpoint, so a client can feed both from the same coordinate
 * helpers.
 *
 * <p>"As the reader sees it" is the whole difficulty. The client measures against the area a viewer
 * actually shows, which is the crop box turned by the page's rotation; the file stores an unturned
 * media box that may be larger and may not start at the origin. {@link #toPdfRectangle(PDPage)} is
 * the translation between the two.
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
     * Places the box on a page, in the coordinates the file stores.
     *
     * <p>Takes the box as measured against the visible, rotated page and returns it in unturned
     * user space, against the crop box rather than the media box. On a trimmed or imposed page
     * those two differ, and reading the request against the wrong one puts the signature somewhere
     * the user did not draw it - which looks like the signature being cut off.
     */
    public PDRectangle toPdfRectangle(PDPage page) {
        PDRectangle crop = page.getCropBox();
        int rotation = quarterTurn(page);
        boolean quarterTurn = rotation == 90 || rotation == 270;

        float visibleWidth = quarterTurn ? crop.getHeight() : crop.getWidth();
        float visibleHeight = quarterTurn ? crop.getWidth() : crop.getHeight();

        float boxWidth = Math.min(width, visibleWidth);
        float boxHeight = Math.min(height, visibleHeight);
        float left = clamp(x, 0f, visibleWidth - boxWidth);
        float bottom = clamp(y, 0f, visibleHeight - boxHeight);

        return switch (rotation) {
            case 90 ->
                    new PDRectangle(
                            crop.getLowerLeftX() + crop.getWidth() - bottom - boxHeight,
                            crop.getLowerLeftY() + left,
                            boxHeight,
                            boxWidth);
            case 180 ->
                    new PDRectangle(
                            crop.getLowerLeftX() + crop.getWidth() - left - boxWidth,
                            crop.getLowerLeftY() + crop.getHeight() - bottom - boxHeight,
                            boxWidth,
                            boxHeight);
            case 270 ->
                    new PDRectangle(
                            crop.getLowerLeftX() + bottom,
                            crop.getLowerLeftY() + crop.getHeight() - left - boxWidth,
                            boxHeight,
                            boxWidth);
            default ->
                    new PDRectangle(
                            crop.getLowerLeftX() + left,
                            crop.getLowerLeftY() + bottom,
                            boxWidth,
                            boxHeight);
        };
    }

    /** The page's rotation, reduced to one of the four quarter turns PDF allows. */
    public static int quarterTurn(PDPage page) {
        return ((page.getRotation() % 360) + 360) % 360 / 90 * 90;
    }

    private static float clamp(float value, float min, float max) {
        if (max < min) {
            return min;
        }
        return Math.max(min, Math.min(max, value));
    }
}
