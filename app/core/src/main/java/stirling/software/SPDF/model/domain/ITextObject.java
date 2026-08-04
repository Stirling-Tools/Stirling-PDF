package stirling.software.SPDF.model.domain;

/**
 * Represents a text object within the document model.
 */
public interface ITextObject extends DomainObject {
    
    /**
     * Returns the text content.
     * 
     * @return Text string
     */
    String getText();
    
    /**
     * Returns the X position of the text in points.
     * 
     * @return X coordinate
     */
    double getX();
    
    /**
     * Returns the Y position of the text in points.
     * 
     * @return Y coordinate
     */
    double getY();
    
    /**
     * Returns the font size in points.
     * 
     * @return Font size
     */
    float getFontSize();
    
    /**
     * Returns the font name.
     * 
     * @return Font name
     */
    String getFontName();
}
