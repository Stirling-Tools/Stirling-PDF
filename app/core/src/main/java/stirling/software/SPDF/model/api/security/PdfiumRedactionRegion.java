package stirling.software.SPDF.model.api.security;

import lombok.Value;

@Value
public class PdfiumRedactionRegion {
    int pageIndex;
    double x;
    double y;
    double width;
    double height;
}
