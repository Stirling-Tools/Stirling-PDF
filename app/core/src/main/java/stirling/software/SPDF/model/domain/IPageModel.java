package stirling.software.SPDF.model.domain;

import java.util.List;

/**
 * Represents a page in the document model.
 * This is a high-level abstraction that owns all content on a single page.
 */
public interface IPageModel extends DomainObject {
    
    /**
     * Returns the page number (0-based index).
     * 
     * @return Page index
     */
    int getPageNumber();
    
    /**
     * Returns the width of the page in points.
     * 
     * @return Page width
     */
    double getWidth();
    
    /**
     * Returns the height of the page in points.
     * 
     * @return Page height
     */
    double getHeight();
    
    /**
     * Returns all text objects on this page.
     * 
     * @return List of text objects
     */
    List<ITextObject> getTextObjects();
    
    /**
     * Returns all image objects on this page.
     * 
     * @return List of image objects
     */
    List<IImageObject> getImageObjects();
    
    /**
     * Returns all annotations on this page.
     * 
     * @return List of annotations
     */
    List<IAnnotation> getAnnotations();
    
    /**
     * Returns the rotation angle of this page in degrees.
     * 
     * @return Rotation angle (0, 90, 180, or 270)
     */
    int getRotation();
}
