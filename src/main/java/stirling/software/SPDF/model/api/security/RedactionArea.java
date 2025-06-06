package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class RedactionArea {
    @Schema(description = "The left edge point of the area to be redacted.")
    private Double x;

    @Schema(description = "The top edge point of the area to be redacted.")
    private Double y;

    @Schema(description = "The height of the area to be redacted.")
    private Double height;

    @Schema(description = "The width of the area to be redacted.")
    private Double width;

    @Schema(description = "The page on which the area should be redacted.")
    private Integer page;

    @Schema(description = "The color used to redact the specified area.")
    private String color;
}
