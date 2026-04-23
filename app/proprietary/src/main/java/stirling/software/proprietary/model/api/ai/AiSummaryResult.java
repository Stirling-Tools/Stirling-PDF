package stirling.software.proprietary.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

/**
 * Structured summary payload produced by the AI engine's summary agent.
 *
 * <p>Shape MUST match {@code SummaryResult} in {@code engine/src/stirling/contracts/summary.py}.
 */
@Data
@Schema(description = "Structured summary payload")
public class AiSummaryResult {

    @Schema(description = "One or two sentence headline summary")
    private String tldr;

    @Schema(description = "Key points drawn from the summarised document(s)")
    private List<String> keyPoints = new ArrayList<>();

    @Schema(
            description =
                    "Optional section-level summaries covering structurally distinct parts of the"
                            + " document(s)")
    private List<AiSummarySection> sections = new ArrayList<>();
}
