package stirling.software.SPDF.model.domain;

/** Represents an image object within the document model. */
public interface IImageObject extends DomainObject {

    /**
     * Returns the X position of the image in points.
     *
     * @return X coordinate
     */
    double getX();

    /**
     * Returns the Y position of the image in points.
     *
     * @return Y coordinate
     */
    double getY();

    /**
     * Returns the width of the image in points.
     *
     * @return Image width
     */
    double getWidth();

    /**
     * Returns the height of the image in points.
     *
     * @return Image height
     */
    double getHeight();
}
