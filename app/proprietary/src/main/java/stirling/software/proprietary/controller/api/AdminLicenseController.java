package stirling.software.proprietary.controller.api;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.GeneralUtils;

/**
 * Admin controller for license management. Provides installation ID for Stripe checkout metadata.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ROLE_ADMIN')")
@Tag(name = "Admin License Management", description = "Admin-only License Management APIs")
public class AdminLicenseController {

    /**
     * Get the installation ID (machine fingerprint) for this self-hosted instance. This ID is used
     * as metadata in Stripe checkout to link licenses to specific installations.
     *
     * @return Map containing the installation ID
     */
    @GetMapping("/installation-id")
    @Operation(
            summary = "Get installation ID",
            description =
                    "Returns the unique installation ID (MAC-based fingerprint) for this"
                            + " self-hosted instance")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<Map<String, String>> getInstallationId() {
        try {
            String installationId = GeneralUtils.generateMachineFingerprint();
            log.info("Admin requested installation ID: {}", installationId);
            return ResponseEntity.ok(Map.of("installationId", installationId));
        } catch (Exception e) {
            log.error("Failed to generate installation ID", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to generate installation ID"));
        }
    }
}
