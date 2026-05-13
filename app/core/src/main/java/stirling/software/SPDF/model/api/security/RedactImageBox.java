package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class RedactImageBox {

    @Schema(description = "0-based page index", requiredMode = Schema.RequiredMode.REQUIRED)
    private int pageIndex;

    @Schema(
            description = "Left edge in PDF user-space (origin bottom-left, Y up)",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float x1;

    @Schema(description = "Bottom edge", requiredMode = Schema.RequiredMode.REQUIRED)
    private float y1;

    @Schema(description = "Right edge", requiredMode = Schema.RequiredMode.REQUIRED)
    private float x2;

    @Schema(description = "Top edge", requiredMode = Schema.RequiredMode.REQUIRED)
    private float y2;
}
