package stirling.software.proprietary.model.api.audit;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Response for the portal Infrastructure → Audit tab: summary strip + recent event rows. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InfraAuditLogResponse {

    @Schema(description = "Headline counts")
    private InfraAuditSummary summary;

    @Schema(description = "Most-recent audit events, newest first")
    private List<InfraAuditEventDto> events;

    @Schema(
            description =
                    "True when this is the whole-server (admin) view. Team-scoped views are false; "
                            + "drives whether the admin-only, whole-server CSV export is offered.")
    private boolean fullServer;
}
