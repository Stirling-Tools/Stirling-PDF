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
import stirling.software.proprietary.model.api.documents.PortalDocumentsResponseDto;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.service.PortalDocumentsService;

/** Serves the portal Documents review queue, derived from real audit data and scoped per caller. */
@ProprietaryUiDataApi
@RequiredArgsConstructor
@EnterpriseEndpoint
public class PortalDocumentsController {

    private final PortalDocumentsService portalDocumentsService;
    private final PortalAuditScopeResolver auditScopeResolver;

    // tier accepted for mock-seam symmetry; ignored (queue isn't tier-scoped).
    @GetMapping("/documents")
    @Operation(
            summary = "Documents review queue",
            description = "Files processed through the org, derived from the audit trail.")
    public ResponseEntity<PortalDocumentsResponseDto> getDocuments(
            @RequestParam(value = "tier", required = false) String tier) {
        PortalAuditScope scope = auditScopeResolver.resolve();
        if (!scope.allowed()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        PortalDocumentsResponseDto body =
                scope.fullServer()
                        ? portalDocumentsService.serverDocuments()
                        : portalDocumentsService.scopedDocuments(
                                scope.cacheKey(), scope.principals());
        return ResponseEntity.ok(body);
    }
}
