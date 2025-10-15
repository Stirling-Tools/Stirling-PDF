package stirling.software.proprietary.model.api.audit;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;

/** Response object returned when querying audit data. */
@Data
@EnterpriseEndpoint
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class AuditDataResponse {

    @Schema(description = "List of audit events matching the query")
    private List<PersistentAuditEvent> content;

    @Schema(description = "Total number of pages available", example = "5")
    private int totalPages;

    @Schema(description = "Total number of events", example = "150")
    private long totalElements;

    @Schema(description = "Current page index", example = "0")
    private int currentPage;
}
