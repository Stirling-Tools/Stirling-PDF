package stirling.software.proprietary.model.api.audit;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;

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
@EqualsAndHashCode
public class AuditExportRequest {

    @Schema(description = "Audit event type to filter by", example = "USER_LOGIN")
    private String type;

    @Schema(description = "Principal (username) to filter by", example = "admin")
    private String principal;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    @Schema(description = "Start date for the export range", example = "2024-01-01")
    private LocalDate startDate;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    @Schema(description = "End date for the export range", example = "2024-01-31")
    private LocalDate endDate;
}
