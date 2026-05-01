package stirling.software.common.model.api.comments;

/**
 * Absolute position of a PDF annotation in the document.
 *
 * <p>Coordinates are in PDF user-space with the origin at the page's bottom-left, consistent with
 * PDFBox's {@code PDRectangle} convention.
 *
 * @param pageIndex 0-indexed page number the annotation lives on.
 * @param x bottom-left x coordinate of the annotation rectangle.
 * @param y bottom-left y coordinate of the annotation rectangle.
 * @param width width of the annotation rectangle, in user-space units.
 * @param height height of the annotation rectangle, in user-space units.
 */
public record AnnotationLocation(int pageIndex, float x, float y, float width, float height) {}
