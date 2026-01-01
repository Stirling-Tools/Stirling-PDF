package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
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
    @ApiResponses(
            value = {
                @ApiResponse(
                        responseCode = "401",
                        description = "Unauthorized - Authentication required")
            })
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

        // Reject null but allow empty string to clear license
        if (licenseKey == null) {
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
            // Empty string will be evaluated as NORMAL license (free tier)
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

    /**
     * Upload a license certificate file for offline activation. Accepts .lic or .cert files,
     * validates the certificate format, saves to configs directory, and activates the license.
     *
     * @param file The license certificate file to upload
     * @return Response with success status, license type, and file information
     */
    @PostMapping(value = "/license-file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Upload license certificate file",
            description =
                    "Upload a license certificate file (.lic, .cert) for offline activation."
                            + " Validates the file format and activates the license.")
    public ResponseEntity<Map<String, Object>> uploadLicenseFile(
            @RequestParam("file") MultipartFile file) {

        // Validate file exists
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "error", "File is empty"));
        }

        String filename = file.getOriginalFilename();
        if (filename == null || filename.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "error", "Invalid filename"));
        }
        // Prevent path traversal and enforce single filename component
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Filename must not contain path separators or '..'"));
        }

        // Validate file extension
        if (!isValidLicenseFile(filename)) {
            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Invalid file type. Expected .lic or .cert"));
        }

        // Check file size (max 1MB for license files)
        if (file.getSize() > 1_048_576) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "error", "File too large. Maximum 1MB allowed"));
        }

        try {
            // Validate certificate format by reading content
            byte[] fileBytes = file.getBytes();
            String content = new String(fileBytes, StandardCharsets.UTF_8);
            if (!content.trim().startsWith("-----BEGIN LICENSE FILE-----")) {
                return ResponseEntity.badRequest()
                        .body(
                                Map.of(
                                        "success",
                                        false,
                                        "error",
                                        "Invalid license certificate format"));
            }

            // Get config directory and target path
            Path configPath = Paths.get(InstallationPathConfig.getConfigPath());
            Path targetPath = configPath.resolve(filename).normalize();
            // Prevent directory traversal: ensure targetPath is inside configPath
            if (!targetPath.startsWith(configPath.normalize().toAbsolutePath())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("success", false, "error", "Invalid file path"));
            }

            // Backup existing file if present
            if (Files.exists(targetPath)) {
                Path backupDir = configPath.resolve("backup");
                Files.createDirectories(backupDir);

                String backupFilename = filename + ".bak." + System.currentTimeMillis();
                Path backupPath = backupDir.resolve(backupFilename);

                Files.copy(targetPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
                log.info("Backed up existing license file to: {}", backupPath);
            }

            // Write new license file
            Files.write(targetPath, fileBytes);
            log.info("License file saved to: {}", targetPath);

            // assume premium enabled when setting license key
            applicationProperties.getPremium().setEnabled(true);

            // Update settings with file reference (relative path)
            String fileReference = "file:configs/" + filename;
            licenseKeyChecker.updateLicenseKey(fileReference);

            // Get license status after activation
            License license = licenseKeyChecker.getPremiumLicenseEnabledResult();

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("licenseType", license.name());
            response.put("filename", filename);
            response.put("filePath", "configs/" + filename);
            response.put("enabled", applicationProperties.getPremium().isEnabled());
            response.put("maxUsers", applicationProperties.getPremium().getMaxUsers());
            response.put("message", "License file uploaded and activated");

            log.info(
                    "License file uploaded and activated: filename={}, type={}",
                    filename,
                    license.name());

            return ResponseEntity.ok(response);

        } catch (IOException e) {
            log.error("Failed to save license file", e);
            return ResponseEntity.internalServerError()
                    .body(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Failed to save license file: " + e.getMessage()));
        } catch (Exception e) {
            log.error("Failed to activate license from file", e);
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
     * Validates if the filename has a valid license file extension (.lic or .cert)
     *
     * @param filename The filename to validate
     * @return true if the filename ends with .lic or .cert (case-insensitive)
     */
    private boolean isValidLicenseFile(String filename) {
        if (filename == null) {
            return false;
        }
        String lower = filename.toLowerCase();
        return lower.endsWith(".lic") || lower.endsWith(".cert");
    }
}
