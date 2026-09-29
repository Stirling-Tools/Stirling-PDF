package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A pre-computed rotation for one page, used by auto-rotate-pdf's apply-only path. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PageRotation {

    @Schema(
            description = "1-based page number to rotate",
            requiredMode = Schema.RequiredMode.REQUIRED,
            example = "1")
    private Integer pageNumber;

    @Schema(
            description =
                    "Additional clockwise rotation to add to the page's current rotation, in"
                            + " degrees. Must be a multiple of 90",
            requiredMode = Schema.RequiredMode.REQUIRED,
            example = "90")
    private Integer rotation;
}
