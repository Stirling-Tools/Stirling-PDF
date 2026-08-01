package stirling.software.proprietary.model.api.audit;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A single infrastructure audit-log row, shaped for the portal Infrastructure → Audit tab. Derived
 * from a {@code audit_events} row: the real {@link
 * stirling.software.proprietary.audit.AuditEventType} is mapped to a display category/action.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InfraAuditEventDto {

    @Schema(description = "Audit event id", example = "8841")
    private String id;

    @Schema(description = "Display timestamp (UTC)", example = "2026-07-07 18:59:31")
    private String timestamp;

    @Schema(description = "Category: auth | config | elevation | processing | security")
    private String category;

    @Schema(description = "Human-readable action", example = "Compress PDF")
    private String action;

    @Schema(description = "Actor principal", example = "alice.chen@acme.com")
    private String actor;

    @Schema(description = "Affected target (file, endpoint, or session)")
    private String target;

    @Schema(description = "Status: success | warning | danger | info")
    private String status;

    @Schema(description = "Operation latency in milliseconds", example = "412")
    private long latencyMs;
}
