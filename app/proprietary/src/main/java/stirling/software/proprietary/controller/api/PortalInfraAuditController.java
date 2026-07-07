package stirling.software.proprietary.controller.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.audit.PortalAuditScope;
import stirling.software.proprietary.audit.PortalAuditScopeResolver;
import stirling.software.proprietary.model.api.audit.InfraAuditLogResponse;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.service.PortalInfraAuditService;

/**
 * Serves the portal Infrastructure → Audit tab from real audit data. The caller's visibility is
 * decided by {@link PortalAuditScopeResolver}: self-hosted admins (and saas admins) see the whole
 * server; in saas a team leader sees only their own team's events. The heavy query + mapping is
 * cached per scope in {@link PortalInfraAuditService}, so repeated loads don't hit the database.
 */
@ProprietaryUiDataApi
@RequiredArgsConstructor
@EnterpriseEndpoint
public class PortalInfraAuditController {

    private final PortalInfraAuditService portalInfraAuditService;
    private final PortalAuditScopeResolver auditScopeResolver;

    /**
     * @param tier accepted for symmetry with the other portal infrastructure endpoints; the audit
     *     log is not tier-scoped, so it is ignored.
     */
    @GetMapping("/infrastructure/audit-log")
    @Operation(
            summary = "Infrastructure audit log",
            description = "Recent audit events shaped for the portal Infrastructure → Audit tab.")
    public ResponseEntity<InfraAuditLogResponse> getInfrastructureAuditLog(
            @RequestParam(value = "tier", required = false) String tier) {
        PortalAuditScope scope = auditScopeResolver.resolve();
        if (!scope.allowed()) {
            // 403 (not a thrown exception) so the tab shows its access message,
            // not a generic 500 - the resolver is the authorization gate here.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        InfraAuditLogResponse body =
                scope.fullServer()
                        ? portalInfraAuditService.serverAuditLog()
                        : portalInfraAuditService.scopedAuditLog(
                                scope.cacheKey(), scope.principals());
        return ResponseEntity.ok(body);
    }
}
