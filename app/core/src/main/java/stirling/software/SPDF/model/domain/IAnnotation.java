package stirling.software.SPDF.model.domain;

/**
 * Represents an annotation within the document model.
 */
public interface IAnnotation extends DomainObject {
    
    /**
     * Returns the type of annotation (e.g., "Text", "Highlight", "Link").
     * 
     * @return Annotation type
     */
    String getAnnotationType();
    
    /**
     * Returns the X position of the annotation in points.
     * 
     * @return X coordinate
     */
    double getX();
    
    /**
     * Returns the Y position of the annotation in points.
     * 
     * @return Y coordinate
     */
    double getY();
    
    /**
     * Returns the width of the annotation in points.
     * 
     * @return Width
     */
    double getWidth();
    
    /**
     * Returns the height of the annotation in points.
     * 
     * @return Height
     */
    double getHeight();
}
