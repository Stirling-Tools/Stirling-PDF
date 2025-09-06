package stirling.software.SPDF.model;

import lombok.Data;

@Data
public class PDFText {
    private final int pageIndex;
    private final float x1;
    private final float y1;
    private final float x2;
    private final float y2;
    private final String text;
}
