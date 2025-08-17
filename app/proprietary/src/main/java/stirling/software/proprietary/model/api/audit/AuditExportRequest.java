package stirling.software.proprietary.model.api.audit;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.security.config.EnterpriseEndpoint;

/** Request object used for exporting audit data with filters. */
@Data
@EnterpriseEndpoint
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class AuditExportRequest extends AuditDateExportRequest {

    @Schema(description = "Audit event type to filter by", example = "USER_LOGIN")
    private String type;

    @Schema(description = "Principal (username) to filter by", example = "admin")
    private String principal;
}
