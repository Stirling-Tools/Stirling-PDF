package stirling.software.proprietary.controller.api;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.audit.PortalAuditScope;
import stirling.software.proprietary.audit.PortalAuditScopeResolver;
import stirling.software.proprietary.model.api.audit.InfraAuditLogResponse;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.service.PortalInfraAuditService;

/** Serves the Infrastructure → Audit tab from real audit data, scoped and cached per caller. */
@ApplicationScoped
@ProprietaryUiDataApi
// @ProprietaryUiDataApi carries only the OpenAPI @Tag; JAX-RS does not inherit @Path from
// meta-annotations, so the base path is declared explicitly here.
@Path("/api/v1/proprietary/ui-data")
@RequiredArgsConstructor
@EnterpriseEndpoint
public class PortalInfraAuditController {

    private final PortalInfraAuditService portalInfraAuditService;
    private final PortalAuditScopeResolver auditScopeResolver;

    // tier accepted for endpoint symmetry; ignored (audit log isn't tier-scoped).
    @GET
    @Path("/infrastructure/audit-log")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Infrastructure audit log",
            description = "Recent audit events shaped for the portal Infrastructure → Audit tab.")
    public Response getInfrastructureAuditLog(@QueryParam("tier") String tier) {
        PortalAuditScope scope = auditScopeResolver.resolve();
        if (!scope.allowed()) {
            // Return 403 (not throw) so the tab shows its access message, not a generic 500.
            return Response.status(Response.Status.FORBIDDEN).build();
        }
        InfraAuditLogResponse body =
                scope.fullServer()
                        ? portalInfraAuditService.serverAuditLog()
                        : portalInfraAuditService.scopedAuditLog(
                                scope.cacheKey(), scope.principals());
        return Response.ok(body).build();
    }
}
