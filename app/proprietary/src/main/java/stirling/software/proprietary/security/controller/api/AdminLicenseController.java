package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

/**
 * Admin controller for license management. Provides installation ID for Stripe checkout metadata
 * and endpoints for managing license keys.
 */
@ApplicationScoped
@Slf4j
@jakarta.ws.rs.Path("/api/v1/admin")
@RolesAllowed("ADMIN")
@Tag(name = "Admin License Management", description = "Admin-only License Management APIs")
public class AdminLicenseController {

    @Inject Instance<LicenseKeyChecker> licenseKeyCheckerInstance;

    @Inject Instance<KeygenLicenseVerifier> keygenLicenseVerifierInstance;

    @Inject ApplicationProperties applicationProperties;

    private LicenseKeyChecker licenseKeyChecker() {
        return licenseKeyCheckerInstance.isResolvable() ? licenseKeyCheckerInstance.get() : null;
    }

    /**
     * Get the installation ID (machine fingerprint) for this self-hosted instance. This ID is used
     * as metadata in Stripe checkout to link licenses to specific installations.
     *
     * @return Map containing the installation ID
     */
    @GET
    @jakarta.ws.rs.Path("/installation-id")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Get installation ID",
            description =
                    "Returns the unique installation ID (MAC-based fingerprint) for this"
                            + " self-hosted instance")
    public Response getInstallationId() {
        try {
            String installationId = GeneralUtils.generateMachineFingerprint();
            log.info("Admin requested installation ID: {}", installationId);
            return Response.ok(Map.of("installationId", installationId)).build();
        } catch (Exception e) {
            log.error("Failed to generate installation ID", e);
            return Response.serverError()
                    .entity(Map.of("error", "Failed to generate installation ID"))
                    .build();
        }
    }

    /**
     * Save and activate a license key. This endpoint accepts a license key from the frontend (e.g.,
     * after Stripe checkout) and activates it on the backend.
     *
     * @param request Map containing the license key
     * @return Response with success status, license type, and whether restart is required
     */
    @POST
    @jakarta.ws.rs.Path("/license-key")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Save and activate license key",
            description =
                    "Accepts a license key and activates it on the backend. Returns the activated"
                            + " license type.")
    public Response saveLicenseKey(Map<String, String> request) {
        String licenseKey = request.get("licenseKey");

        // Reject null but allow empty string to clear license
        if (licenseKey == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("success", false, "error", "License key is required"))
                    .build();
        }

        try {
            LicenseKeyChecker licenseKeyChecker = licenseKeyChecker();
            if (licenseKeyChecker == null) {
                return Response.serverError()
                        .entity(Map.of("success", false, "error", "License checker not available"))
                        .build();
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

            return Response.ok(response).build();
        } catch (Exception e) {
            log.error("Failed to save license key", e);
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Failed to activate license: " + e.getMessage()))
                    .build();
        }
    }

    /**
     * Resync the current license with Keygen. This endpoint re-validates the existing license key
     * and updates the max users setting. Used after subscription upgrades to sync the new license
     * limits.
     *
     * @return Response with updated license information
     */
    @POST
    @jakarta.ws.rs.Path("/license/resync")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Resync license with Keygen",
            description =
                    "Re-validates the existing license key with Keygen and updates local settings."
                            + " Used after subscription upgrades.")
    public Response resyncLicense() {
        try {
            LicenseKeyChecker licenseKeyChecker = licenseKeyChecker();
            if (licenseKeyChecker == null) {
                return Response.serverError()
                        .entity(Map.of("success", false, "error", "License checker not available"))
                        .build();
            }

            String currentKey = applicationProperties.getPremium().getKey();
            if (currentKey == null || currentKey.trim().isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("success", false, "error", "No license key configured"))
                        .build();
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

            return Response.ok(response).build();
        } catch (Exception e) {
            log.error("Failed to resync license", e);
            return Response.serverError()
                    .entity(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Failed to resync license: " + e.getMessage()))
                    .build();
        }
    }

    /**
     * Get information about the current license key status, including license type, enabled status,
     * and max users.
     *
     * @return Map containing license information
     */
    @GET
    @jakarta.ws.rs.Path("/license-info")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Get license information",
            description =
                    "Returns information about the current license including type, enabled status,"
                            + " and max users")
    public Response getLicenseInfo() {
        try {
            Map<String, Object> response = new HashMap<>();

            LicenseKeyChecker licenseKeyChecker = licenseKeyChecker();
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

            return Response.ok(response).build();
        } catch (Exception e) {
            log.error("Failed to get license info", e);
            return Response.serverError()
                    .entity(Map.of("error", "Failed to retrieve license information"))
                    .build();
        }
    }

    /**
     * Upload a license certificate file for offline activation. Accepts .lic or .cert files,
     * validates the certificate format, saves to configs directory, and activates the license.
     *
     * @param fileUpload The license certificate file to upload
     * @return Response with success status, license type, and file information
     */
    @POST
    @jakarta.ws.rs.Path("/license-file")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Upload license certificate file",
            description =
                    "Upload a license certificate file (.lic, .cert) for offline activation."
                            + " Validates the file format and activates the license.")
    public Response uploadLicenseFile(@RestForm("file") FileUpload fileUpload) {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);

        // Validate file exists
        if (file == null || file.isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("success", false, "error", "File is empty"))
                    .build();
        }

        String filename = file.getOriginalFilename();
        if (filename == null || filename.trim().isEmpty()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("success", false, "error", "Invalid filename"))
                    .build();
        }
        // Prevent path traversal and enforce single filename component
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Filename must not contain path separators or '..'"))
                    .build();
        }

        // Validate file extension
        if (!isValidLicenseFile(filename)) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Invalid file type. Expected .lic or .cert"))
                    .build();
        }

        // Check file size (max 1MB for license files)
        if (file.getSize() > 1_048_576) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "File too large. Maximum 1MB allowed"))
                    .build();
        }

        try {
            log.info(
                    "License upload: original filename='{}', size={} bytes, contentType='{}'",
                    file.getOriginalFilename(),
                    file.getSize(),
                    file.getContentType());
            // Validate certificate format by reading content
            byte[] fileBytes = file.getBytes();
            String content = new String(fileBytes, StandardCharsets.UTF_8);
            if (!content.trim().startsWith("-----BEGIN LICENSE FILE-----")) {
                log.warn("License upload rejected: invalid certificate header");
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(
                                Map.of(
                                        "success",
                                        false,
                                        "error",
                                        "Invalid license certificate format"))
                        .build();
            }

            // Get config directory and target path
            Path configPath = Paths.get(InstallationPathConfig.getConfigPath());
            Path configPathAbs = configPath.toAbsolutePath().normalize();
            Path targetPath = configPathAbs.resolve(filename).normalize();
            log.info(
                    "License upload paths: configPath='{}', targetPath='{}'",
                    configPathAbs,
                    targetPath.toAbsolutePath());
            // Prevent directory traversal: ensure targetPath is inside configPath
            if (!targetPath.startsWith(configPathAbs)) {
                log.warn("License upload rejected: target path outside config path");
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("success", false, "error", "Invalid file path"))
                        .build();
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
            LicenseKeyChecker licenseKeyChecker = licenseKeyChecker();
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

            return Response.ok(response).build();

        } catch (IOException e) {
            log.error("Failed to save license file", e);
            return Response.serverError()
                    .entity(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Failed to save license file: " + e.getMessage()))
                    .build();
        } catch (Exception e) {
            log.error("Failed to activate license from file", e);
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "success",
                                    false,
                                    "error",
                                    "Failed to activate license: " + e.getMessage()))
                    .build();
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
