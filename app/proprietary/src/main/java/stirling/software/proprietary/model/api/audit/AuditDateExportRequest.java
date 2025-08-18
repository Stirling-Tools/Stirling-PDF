package stirling.software.proprietary.model.api.audit;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.security.config.EnterpriseEndpoint;

@Data
@EnterpriseEndpoint
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class AuditDateExportRequest {

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    @Schema(description = "Start date for the export range", example = "2025-01-01")
    private LocalDate startDate;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    @Schema(description = "End date for the export range", example = "2025-12-31")
    private LocalDate endDate;
}
