package stirling.software.proprietary.audit;

import java.util.HashMap;
import java.util.Map;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;

@Path("")
@ApplicationScoped
@RolesAllowed("ADMIN")
@RequiredArgsConstructor
@EnterpriseEndpoint
public class AuditDashboardWebController {
    private final AuditConfigurationProperties auditConfig;

    /** Display the audit dashboard. */
    @GET
    @Path("/audit")
    @Hidden
    public Response showDashboard() {
        // Spring's org.springframework.ui.Model + view-name ("audit/dashboard") drove Thymeleaf
        // server-side rendering. Quarkus has no Thymeleaf view resolver; the equivalent is a Qute
        // TemplateInstance bound to src/main/resources/templates/audit/dashboard.html.
        Map<String, Object> model = new HashMap<>();
        model.put("auditEnabled", auditConfig.isEnabled());
        model.put("auditLevel", auditConfig.getAuditLevel());
        model.put("auditLevelInt", auditConfig.getLevel());
        model.put("retentionDays", auditConfig.getRetentionDays());

        // Add audit level enum values for display
        model.put("auditLevels", AuditLevel.values());

        // Add audit event types for the dropdown
        model.put("auditEventTypes", AuditEventType.values());

        return Response.ok(model).build();
    }
}
