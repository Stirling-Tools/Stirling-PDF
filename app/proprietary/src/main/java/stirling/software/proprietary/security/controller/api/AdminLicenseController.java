package stirling.software.proprietary.security.controller.api;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

/**
 * Admin controller for license management. Provides installation ID for Stripe checkout metadata
 * and endpoints for managing license keys.
 */
@RestController
@Slf4j
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ROLE_ADMIN')")
@Tag(name = "Admin License Management", description = "Admin-only License Management APIs")
public class AdminLicenseController {

    @Autowired(required = false)
    private LicenseKeyChecker licenseKeyChecker;

    @Autowired(required = false)
    private KeygenLicenseVerifier keygenLicenseVerifier;

    @Autowired private ApplicationProperties applicationProperties;

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

    /**
     * Save and activate a license key. This endpoint accepts a license key from the frontend (e.g.,
     * after Stripe checkout) and activates it on the backend.
     *
     * @param request Map containing the license key
     * @return Response with success status, license type, and whether restart is required
     */
    @PostMapping("/license-key")
    @Operation(
            summary = "Save and activate license key",
            description =
                    "Accepts a license key and activates it on the backend. Returns the activated"
                            + " license type.")
    public ResponseEntity<Map<String, Object>> saveLicenseKey(
            @RequestBody Map<String, String> request) {
        String licenseKey = request.get("licenseKey");

        if (licenseKey == null || licenseKey.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "error", "License key is required"));
        }

        try {
            if (licenseKeyChecker == null) {
                return ResponseEntity.internalServerError()
                        .body(Map.of("success", false, "error", "License checker not available"));
            }
            // assume premium enabled when setting license key
            applicationProperties.getPremium().setEnabled(true);

            // Use existing LicenseKeyChecker to update and validate license
            licenseKeyChecker.updateLicenseKey(licenseKey.trim());

            // Get current license status
            License license = licenseKeyChecker.getPremiumLicenseEnabledResult();

            // Auto-enable premium features if license is valid
            if (license != License.NORMAL) {
                GeneralUtils.saveKeyToSettings("premium.enabled", true);
                // Enable premium features

                // Save maxUsers from license metadata
                Integer maxUsers = applicationProperties.getPremium().getMaxUsers();
                if (maxUsers != null) {
                    GeneralUtils.saveKeyToSettings("premium.maxUsers", maxUsers);
                }

                log.info(
                        "Premium features enabled: type={}, maxUsers={}", license.name(), maxUsers);
            } else {
                GeneralUtils.saveKeyToSettings("premium.enabled", false);
                log.info("License key is not valid for premium features: type={}", license.name());
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("licenseType", license.name());
            response.put("enabled", applicationProperties.getPremium().isEnabled());
            response.put("maxUsers", applicationProperties.getPremium().getMaxUsers());
            response.put("requiresRestart", false); // Dynamic evaluation works
            response.put("message", "License key saved and activated");

            log.info("License key saved and activated: type={}", license.name());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to save license key", e);
            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Failed to activate license: " + e.getMessage()));
        }
    }

    /**
     * Resync the current license with Keygen. This endpoint re-validates the existing license key
     * and updates the max users setting. Used after subscription upgrades to sync the new license
     * limits.
     *
     * @return Response with updated license information
     */
    @PostMapping("/license/resync")
    @Operation(
            summary = "Resync license with Keygen",
            description =
                    "Re-validates the existing license key with Keygen and updates local settings."
                            + " Used after subscription upgrades.")
    public ResponseEntity<Map<String, Object>> resyncLicense() {
        try {
            if (licenseKeyChecker == null) {
                return ResponseEntity.internalServerError()
                        .body(Map.of("success", false, "error", "License checker not available"));
            }

            String currentKey = applicationProperties.getPremium().getKey();
            if (currentKey == null || currentKey.trim().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("success", false, "error", "No license key configured"));
            }

            log.info("Resyncing license with Keygen");

            // Re-validate license and sync settings
            licenseKeyChecker.resyncLicense();

            // Get updated license status
            License license = licenseKeyChecker.getPremiumLicenseEnabledResult();
            ApplicationProperties.Premium premium = applicationProperties.getPremium();

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("licenseType", license.name());
            response.put("enabled", premium.isEnabled());
            response.put("maxUsers", premium.getMaxUsers());
            response.put("message", "License resynced successfully");

            log.info(
                    "License resynced: type={}, maxUsers={}",
                    license.name(),
                    premium.getMaxUsers());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to resync license", e);
            return ResponseEntity.internalServerError()
                    .body(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Failed to resync license: " + e.getMessage()));
        }
    }

    /**
     * Get information about the current license key status, including license type, enabled status,
     * and max users.
     *
     * @return Map containing license information
     */
    @GetMapping("/license-info")
    @Operation(
            summary = "Get license information",
            description =
                    "Returns information about the current license including type, enabled status,"
                            + " and max users")
    public ResponseEntity<Map<String, Object>> getLicenseInfo() {
        try {
            Map<String, Object> response = new HashMap<>();

            if (licenseKeyChecker != null) {
                License license = licenseKeyChecker.getPremiumLicenseEnabledResult();
                response.put("licenseType", license.name());
            } else {
                response.put("licenseType", License.NORMAL.name());
            }

            ApplicationProperties.Premium premium = applicationProperties.getPremium();
            response.put("enabled", premium.isEnabled());
            response.put("maxUsers", premium.getMaxUsers());
            response.put("hasKey", premium.getKey() != null && !premium.getKey().trim().isEmpty());

            // Include license key for upgrades (admin-only endpoint)
            if (premium.getKey() != null && !premium.getKey().trim().isEmpty()) {
                response.put("licenseKey", premium.getKey());
            }

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Failed to get license info", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to retrieve license information"));
        }
    }
}
