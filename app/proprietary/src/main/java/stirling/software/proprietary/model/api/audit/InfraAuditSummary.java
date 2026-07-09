package stirling.software.proprietary.model.api.audit;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Headline counts for the infrastructure audit-log tab, derived from the returned events. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InfraAuditSummary {

    @Schema(description = "Total events in the returned window", example = "40")
    private int totalEvents;

    @Schema(description = "Processing-category events", example = "24")
    private int processing;

    @Schema(description = "Elevation-category events", example = "0")
    private int elevation;

    @Schema(description = "Config-category events", example = "6")
    private int config;
}
