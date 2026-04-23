package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A section-level summary within a summary workflow response.
 *
 * <p>Values MUST match {@code SummarySection} in {@code engine/src/stirling/contracts/summary.py}.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Section-level summary within an AI summary response")
public class AiSummarySection {

    @Schema(description = "Section heading")
    private String heading;

    @Schema(description = "Summary of the section's contents")
    private String summary;
}
