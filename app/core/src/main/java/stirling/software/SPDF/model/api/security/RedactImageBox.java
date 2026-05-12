package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class RedactImageBox {

    @Schema(description = "0-based page index.")
    private int pageIndex;

    @Schema(description = "Left edge in PDF user-space (origin bottom-left, Y up).")
    private float x1;

    @Schema(description = "Bottom edge in PDF user-space.")
    private float y1;

    @Schema(description = "Right edge in PDF user-space.")
    private float x2;

    @Schema(description = "Top edge in PDF user-space.")
    private float y2;
}
