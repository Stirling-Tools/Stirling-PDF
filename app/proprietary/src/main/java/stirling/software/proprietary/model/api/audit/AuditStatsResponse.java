package stirling.software.proprietary.model.api.audit;

import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.security.config.EnterpriseEndpoint;

/** Response object for audit statistics. */
@Data
@EnterpriseEndpoint
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class AuditStatsResponse {

    @Schema(description = "Count of events grouped by type")
    private Map<String, Long> eventsByType;

    @Schema(description = "Count of events grouped by principal")
    private Map<String, Long> eventsByPrincipal;

    @Schema(description = "Count of events grouped by day")
    private Map<String, Long> eventsByDay;

    @Schema(description = "Total number of events in the period", example = "42")
    private int totalEvents;
}
