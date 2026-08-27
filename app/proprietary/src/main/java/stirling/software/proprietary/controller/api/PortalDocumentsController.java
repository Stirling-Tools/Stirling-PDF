package stirling.software.proprietary.controller.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.ConditionalOnProcessor;
import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.audit.PortalAuditScope;
import stirling.software.proprietary.audit.PortalDocumentsScopeResolver;
import stirling.software.proprietary.model.api.documents.PortalDocumentsResponseDto;
import stirling.software.proprietary.service.PortalDocumentsService;

/**
 * Serves the portal Documents review queue, derived from real audit data and scoped per caller.
 *
 * <p>Open to every portal user (not Enterprise-gated): the Documents tab is a core Processor
 * feature. Access is enforced by {@code @resourceAccess.canUsePortal()}; visibility is then
 * resolved per deployment - self-hosted portal users see the whole server, SaaS users see their
 * team (see {@link PortalDocumentsScopeResolver}).
 */
// Serves the portal only, and an editor-only server has no portal to serve.
@ProprietaryUiDataApi
@ConditionalOnProcessor
@RequiredArgsConstructor
@PreAuthorize("@resourceAccess.canUsePortal()")
public class PortalDocumentsController {

    private final PortalDocumentsService portalDocumentsService;
    private final PortalDocumentsScopeResolver documentsScopeResolver;

    // tier accepted for mock-seam symmetry; ignored (queue isn't tier-scoped).
    @GetMapping("/documents")
    @Operation(
            summary = "Documents review queue",
            description = "Files processed through the org, derived from the audit trail.")
    public ResponseEntity<PortalDocumentsResponseDto> getDocuments(
            @RequestParam(value = "tier", required = false) String tier) {
        PortalAuditScope scope = documentsScopeResolver.resolve();
        if (!scope.allowed()) {
            // SaaS caller with no team has nothing to show; surface an empty tab, not a 500.
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
