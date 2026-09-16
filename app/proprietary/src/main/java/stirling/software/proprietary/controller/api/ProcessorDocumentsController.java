package stirling.software.proprietary.controller.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.audit.ProcessorAuditScope;
import stirling.software.proprietary.audit.ProcessorDocumentsScopeResolver;
import stirling.software.proprietary.model.api.documents.ProcessorDocumentsResponseDto;
import stirling.software.proprietary.service.ProcessorDocumentsService;

/**
 * Serves the processor Documents review queue, derived from real audit data and scoped per caller.
 *
 * <p>Open to every processor user (not Enterprise-gated): the Documents tab is a core Processor
 * feature. Access is enforced by {@code @resourceAccess.canUseProcessor()}; visibility is then
 * resolved per deployment - self-hosted processor users see the whole server, SaaS users see their
 * team (see {@link ProcessorDocumentsScopeResolver}).
 */
@ProprietaryUiDataApi
@RequiredArgsConstructor
@PreAuthorize("@resourceAccess.canUseProcessor()")
public class ProcessorDocumentsController {

    private final ProcessorDocumentsService processorDocumentsService;
    private final ProcessorDocumentsScopeResolver documentsScopeResolver;

    // tier accepted for mock-seam symmetry; ignored (queue isn't tier-scoped).
    @GetMapping("/documents")
    @Operation(
            summary = "Documents review queue",
            description = "Files processed through the org, derived from the audit trail.")
    public ResponseEntity<ProcessorDocumentsResponseDto> getDocuments(
            @RequestParam(value = "tier", required = false) String tier) {
        ProcessorAuditScope scope = documentsScopeResolver.resolve();
        if (!scope.allowed()) {
            // SaaS caller with no team has nothing to show; surface an empty tab, not a 500.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        ProcessorDocumentsResponseDto body =
                scope.fullServer()
                        ? processorDocumentsService.serverDocuments()
                        : processorDocumentsService.scopedDocuments(
                                scope.cacheKey(), scope.principals());
        return ResponseEntity.ok(body);
    }
}
