package stirling.software.proprietary.model.api.audit;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.proprietary.security.config.EnterpriseEndpoint;

/** Request object used for querying audit events. */
@Data
@EnterpriseEndpoint
@EqualsAndHashCode(callSuper = true)
public class AuditDataRequest extends AuditExportRequest {

    @Schema(description = "Page number for pagination", example = "0", defaultValue = "0")
    private int page = 0;

    @Schema(description = "Page size for pagination", example = "30", defaultValue = "30")
    private int size = 30;
}
