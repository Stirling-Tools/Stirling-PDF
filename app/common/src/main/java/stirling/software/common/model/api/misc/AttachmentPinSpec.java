package stirling.software.common.model.api.misc;

/**
 * Placement of a clickable file-attachment pin on a PDF page.
 *
 * <p>Coordinates are normalized to the page as displayed: {@code x=0} is the left edge, {@code x=1}
 * the right edge, {@code y=0} the top edge, and {@code y=1} the bottom edge. This keeps the caller
 * independent of page rotation and PDF user-space orientation.
 *
 * @param filename embedded file name the pin opens
 * @param pageIndex 0-indexed page that owns the pin
 * @param x horizontal position across the displayed page
 * @param y vertical position down the displayed page
 */
public record AttachmentPinSpec(String filename, int pageIndex, float x, float y) {}
