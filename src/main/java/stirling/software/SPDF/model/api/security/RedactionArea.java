package stirling.software.SPDF.model.api.security;

import lombok.Data;

@Data
public class RedactionArea {
    private Double x;
    private Double y;

    private Double height;
    private Double width;

    private Integer page;
}
