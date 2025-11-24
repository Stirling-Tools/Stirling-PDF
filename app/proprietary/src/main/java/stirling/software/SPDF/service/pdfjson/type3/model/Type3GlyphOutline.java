package stirling.software.SPDF.service.pdfjson.type3.model;

import java.awt.geom.GeneralPath;

import org.apache.pdfbox.pdmodel.common.PDRectangle;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class Type3GlyphOutline {
    String glyphName;
    int charCode;
    float advanceWidth;
    PDRectangle boundingBox;
    GeneralPath outline;
    boolean hasStroke;
    boolean hasFill;
    boolean hasImages;
    boolean hasText;
    boolean hasShading;
    String warnings;
    Integer unicode;
}
