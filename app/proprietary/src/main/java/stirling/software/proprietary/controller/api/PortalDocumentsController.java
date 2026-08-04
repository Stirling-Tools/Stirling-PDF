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
import stirling.software.proprietary.model.api.documents.PortalDocumentsResponseDto;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.service.PortalDocumentsService;

/** Serves the portal Documents review queue, derived from real audit data and scoped per caller. */
@ApplicationScoped
@ProprietaryUiDataApi
// @ProprietaryUiDataApi carries only the OpenAPI @Tag; JAX-RS does not inherit @Path from
// meta-annotations, so the base path is declared explicitly here.
@Path("/api/v1/proprietary/ui-data")
@RequiredArgsConstructor
@EnterpriseEndpoint
public class PortalDocumentsController {

    private final PortalDocumentsService portalDocumentsService;
    private final PortalAuditScopeResolver auditScopeResolver;

    // tier accepted for mock-seam symmetry; ignored (queue isn't tier-scoped).
    @GET
    @Path("/documents")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Documents review queue",
            description = "Files processed through the org, derived from the audit trail.")
    public Response getDocuments(@QueryParam("tier") String tier) {
        PortalAuditScope scope = auditScopeResolver.resolve();
        if (!scope.allowed()) {
            return Response.status(Response.Status.FORBIDDEN).build();
        }
        PortalDocumentsResponseDto body =
                scope.fullServer()
                        ? portalDocumentsService.serverDocuments()
                        : portalDocumentsService.scopedDocuments(
                                scope.cacheKey(), scope.principals());
        return Response.ok(body).build();
    }
}
