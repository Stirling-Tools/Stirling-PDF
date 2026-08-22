package stirling.software.proprietary.controller.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.audit.ProcessorAuditScope;
import stirling.software.proprietary.audit.ProcessorAuditScopeResolver;
import stirling.software.proprietary.model.api.documents.ProcessorDocumentsResponseDto;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.service.ProcessorDocumentsService;

/**
 * Serves the processor Documents review queue, derived from real audit data and scoped per caller.
 */
@ProprietaryUiDataApi
@RequiredArgsConstructor
@EnterpriseEndpoint
public class ProcessorDocumentsController {

    private final ProcessorDocumentsService processorDocumentsService;
    private final ProcessorAuditScopeResolver auditScopeResolver;

    // tier accepted for mock-seam symmetry; ignored (queue isn't tier-scoped).
    @GetMapping("/documents")
    @Operation(
            summary = "Documents review queue",
            description = "Files processed through the org, derived from the audit trail.")
    public ResponseEntity<ProcessorDocumentsResponseDto> getDocuments(
            @RequestParam(value = "tier", required = false) String tier) {
        ProcessorAuditScope scope = auditScopeResolver.resolve();
        if (!scope.allowed()) {
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
