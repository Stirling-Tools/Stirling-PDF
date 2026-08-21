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

/** Serves the Infrastructure → Audit tab from real audit data, scoped and cached per caller. */
@ProprietaryUiDataApi
@RequiredArgsConstructor
@EnterpriseEndpoint
public class PortalInfraAuditController {

    private final PortalInfraAuditService portalInfraAuditService;
    private final PortalAuditScopeResolver auditScopeResolver;

    // tier accepted for endpoint symmetry; ignored (audit log isn't tier-scoped).
    @GetMapping("/infrastructure/audit-log")
    @Operation(
            summary = "Infrastructure audit log",
            description = "Recent audit events shaped for the portal Infrastructure → Audit tab.")
    public ResponseEntity<InfraAuditLogResponse> getInfrastructureAuditLog(
            @RequestParam(value = "tier", required = false) String tier) {
        PortalAuditScope scope = auditScopeResolver.resolve();
        if (!scope.allowed()) {
            // Return 403 (not throw) so the tab shows its access message, not a generic 500.
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
