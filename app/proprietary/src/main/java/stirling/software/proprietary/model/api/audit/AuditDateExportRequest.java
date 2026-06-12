package stirling.software.proprietary.model.api.audit;

import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.ws.rs.QueryParam;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.security.config.EnterpriseEndpoint;

// MIGRATION: this is a @BeanParam target on @GET endpoints. RESTEasy Reactive binds @BeanParam from
// annotated FIELDS, so each query parameter needs an explicit @QueryParam (Spring bound these by
// getter/property name automatically). Without any param-annotated field the build fails with
// "No annotations found on fields ...".
@Data
@EnterpriseEndpoint
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class AuditDateExportRequest {

    // TODO: Migration required - Spring @DateTimeFormat(iso = ISO.DATE) removed; JAX-RS binds
    // LocalDate via its default ISO-8601 (yyyy-MM-dd) ParamConverter, so ISO.DATE form values
    // still bind. If a non-ISO format is ever needed, register a jakarta.ws.rs.ext.ParamConverter.
    @QueryParam("startDate")
    @Schema(description = "Start date for the export range", example = "2025-01-01")
    private LocalDate startDate;

    @QueryParam("endDate")
    @Schema(description = "End date for the export range", example = "2025-12-31")
    private LocalDate endDate;
}
