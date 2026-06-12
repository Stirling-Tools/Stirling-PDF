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
        // TODO: Migration required - rebind this view to Qute. Inject
        // @io.quarkus.qute.Location("audit/dashboard") io.quarkus.qute.Template dashboard; and
        // return
        // dashboard.data(...) as a TemplateInstance (with a Qute RestEasy extension), or render the
        // page client-side. The model attributes below are preserved so they can be passed to the
        // Qute template once the audit/dashboard template is ported.
        Map<String, Object> model = new HashMap<>();
        model.put("auditEnabled", auditConfig.isEnabled());
        model.put("auditLevel", auditConfig.getAuditLevel());
        model.put("auditLevelInt", auditConfig.getLevel());
        model.put("retentionDays", auditConfig.getRetentionDays());

        // Add audit level enum values for display
        model.put("auditLevels", AuditLevel.values());

        // Add audit event types for the dropdown
        model.put("auditEventTypes", AuditEventType.values());

        // TODO: Migration required - return the rendered Qute template instead of this placeholder
        // once audit/dashboard.html is migrated. The attributes in `model` map 1:1 to the former
        // Spring Model attributes.
        return Response.ok(model).build();
    }
}
