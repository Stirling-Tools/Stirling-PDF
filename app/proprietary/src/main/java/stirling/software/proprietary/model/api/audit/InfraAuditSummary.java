package stirling.software.proprietary.model.api.audit;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Infrastructure audit counts over the full preceding 24 hours in the permitted scope. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InfraAuditSummary {

    @Schema(description = "Total infrastructure events in the preceding 24 hours", example = "40")
    private int totalEvents;

    @Schema(description = "Policy-run events", example = "3")
    private int policy;

    @Schema(description = "Processing-category events", example = "24")
    private int processing;

    @Schema(description = "Elevation-category events", example = "0")
    private int elevation;

    @Schema(description = "Config-category events", example = "6")
    private int config;
}
