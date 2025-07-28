package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.util.HtmlUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.model.api.admin.SettingValueResponse;
import stirling.software.proprietary.security.model.api.admin.UpdateSettingValueRequest;
import stirling.software.proprietary.security.model.api.admin.UpdateSettingsRequest;

@Controller
@Tag(name = "Admin Settings", description = "Admin-only Settings Management APIs")
@RequestMapping("/api/v1/admin/settings")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ROLE_ADMIN')")
@Slf4j
public class AdminSettingsController {

    private final ApplicationProperties applicationProperties;
    private final ObjectMapper objectMapper;

    @GetMapping
    @Operation(
            summary = "Get all application settings",
            description = "Retrieve all current application settings. Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(responseCode = "200", description = "Settings retrieved successfully"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required")
            })
    public ResponseEntity<ApplicationProperties> getSettings() {
        log.debug("Admin requested all application settings");
        return ResponseEntity.ok(applicationProperties);
    }

    @GetMapping("/file")
    @Operation(
            summary = "Get settings file content",
            description =
                    "Retrieve the raw settings.yml file content showing the latest saved values (after restart). Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Settings file retrieved successfully"),
                @ApiResponse(responseCode = "404", description = "Settings file not found"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required"),
                @ApiResponse(responseCode = "500", description = "Failed to read settings file")
            })
    public ResponseEntity<?> getSettingsFile() {
        try {
            Path settingsPath = Paths.get(InstallationPathConfig.getSettingsPath());
            if (!Files.exists(settingsPath)) {
                return ResponseEntity.notFound().build();
            }

            String fileContent = Files.readString(settingsPath);
            log.debug("Admin requested settings file content");

            // Return as JSON with the file content
            Map<String, String> response =
                    Map.of("filePath", settingsPath.toString(), "content", fileContent);
            return ResponseEntity.ok(response);

        } catch (IOException e) {
            log.error("Failed to read settings file: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to read settings file: " + e.getMessage());
        } catch (Exception e) {
            log.error("Unexpected error reading settings file: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Unexpected error reading settings file");
        }
    }

    @PutMapping
    @Operation(
            summary = "Update application settings (delta updates)",
            description =
                    "Update specific application settings using dot notation keys. Only sends changed values. Changes take effect on restart. Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(responseCode = "200", description = "Settings updated successfully"),
                @ApiResponse(responseCode = "400", description = "Invalid setting key or value"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required"),
                @ApiResponse(
                        responseCode = "500",
                        description = "Failed to save settings to configuration file")
            })
    public ResponseEntity<String> updateSettings(
            @Valid @RequestBody UpdateSettingsRequest request) {
        try {
            Map<String, Object> settings = request.getSettings();
            if (settings == null || settings.isEmpty()) {
                return ResponseEntity.badRequest().body("No settings provided to update");
            }

            int updatedCount = 0;
            for (Map.Entry<String, Object> entry : settings.entrySet()) {
                String key = entry.getKey();
                Object value = entry.getValue();

                if (!isValidSettingKey(key)) {
                    return ResponseEntity.badRequest()
                            .body("Invalid setting key format: " + HtmlUtils.htmlEscape(key));
                }

                log.info("Admin updating setting: {} = {}", key, value);
                GeneralUtils.saveKeyToSettings(key, value);
                updatedCount++;
            }

            return ResponseEntity.ok(
                    String.format(
                            "Successfully updated %d setting(s). Changes will take effect on application restart.",
                            updatedCount));

        } catch (IOException e) {
            log.error("Failed to save settings to file: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(GENERIC_FILE_ERROR);

        } catch (IllegalArgumentException e) {
            log.error("Invalid setting key or value: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(GENERIC_INVALID_SETTING);
        } catch (Exception e) {
            log.error("Unexpected error while updating settings: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(GENERIC_SERVER_ERROR);
        }
    }

    @GetMapping("/section/{sectionName}")
    @Operation(
            summary = "Get specific settings section",
            description =
                    "Retrieve settings for a specific section (e.g., security, system, ui). Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Section settings retrieved successfully"),
                @ApiResponse(responseCode = "400", description = "Invalid section name"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required")
            })
    public ResponseEntity<?> getSettingsSection(@PathVariable String sectionName) {
        try {
            Object sectionData = getSectionData(sectionName);
            if (sectionData == null) {
                return ResponseEntity.badRequest()
                        .body(
                                "Invalid section name: "
                                        + HtmlUtils.htmlEscape(sectionName)
                                        + ". Valid sections: "
                                        + String.join(", ", VALID_SECTION_NAMES));
            }
            log.debug("Admin requested settings section: {}", sectionName);
            return ResponseEntity.ok(sectionData);
        } catch (IllegalArgumentException e) {
            log.error("Invalid section name {}: {}", sectionName, e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("Invalid section name: " + HtmlUtils.htmlEscape(sectionName));
        } catch (Exception e) {
            log.error("Error retrieving section {}: {}", sectionName, e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to retrieve section.");
        }
    }

    @PutMapping("/section/{sectionName}")
    @Operation(
            summary = "Update specific settings section",
            description = "Update all settings within a specific section. Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Section settings updated successfully"),
                @ApiResponse(responseCode = "400", description = "Invalid section name or data"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required"),
                @ApiResponse(responseCode = "500", description = "Failed to save settings")
            })
    public ResponseEntity<String> updateSettingsSection(
            @PathVariable String sectionName, @Valid @RequestBody Map<String, Object> sectionData) {
        try {
            if (sectionData == null || sectionData.isEmpty()) {
                return ResponseEntity.badRequest().body("No section data provided to update");
            }

            if (!isValidSectionName(sectionName)) {
                return ResponseEntity.badRequest()
                        .body(
                                "Invalid section name: "
                                        + HtmlUtils.htmlEscape(sectionName)
                                        + ". Valid sections: "
                                        + String.join(", ", VALID_SECTION_NAMES));
            }

            int updatedCount = 0;
            for (Map.Entry<String, Object> entry : sectionData.entrySet()) {
                String propertyKey = entry.getKey();
                String fullKey = sectionName + "." + propertyKey;
                Object value = entry.getValue();

                if (!isValidSettingKey(fullKey)) {
                    return ResponseEntity.badRequest()
                            .body("Invalid setting key format: " + HtmlUtils.htmlEscape(fullKey));
                }

                log.info("Admin updating section setting: {} = {}", fullKey, value);
                GeneralUtils.saveKeyToSettings(fullKey, value);
                updatedCount++;
            }

            String escapedSectionName = HtmlUtils.htmlEscape(sectionName);
            return ResponseEntity.ok(
                    String.format(
                            "Successfully updated %d setting(s) in section '%s'. Changes will take effect on application restart.",
                            updatedCount, escapedSectionName));

        } catch (IOException e) {
            log.error("Failed to save section settings to file: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(GENERIC_FILE_ERROR);
        } catch (IllegalArgumentException e) {
            log.error("Invalid section data: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(GENERIC_INVALID_SECTION);
        } catch (Exception e) {
            log.error("Unexpected error while updating section settings: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(GENERIC_SERVER_ERROR);
        }
    }

    @GetMapping("/key/{key}")
    @Operation(
            summary = "Get specific setting value",
            description =
                    "Retrieve value for a specific setting key using dot notation. Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Setting value retrieved successfully"),
                @ApiResponse(responseCode = "400", description = "Invalid setting key"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required")
            })
    public ResponseEntity<?> getSettingValue(@PathVariable String key) {
        try {
            if (!isValidSettingKey(key)) {
                return ResponseEntity.badRequest()
                        .body("Invalid setting key format: " + HtmlUtils.htmlEscape(key));
            }

            Object value = getSettingByKey(key);
            if (value == null) {
                return ResponseEntity.badRequest()
                        .body("Setting key not found: " + HtmlUtils.htmlEscape(key));
            }
            log.debug("Admin requested setting: {}", key);
            return ResponseEntity.ok(new SettingValueResponse(key, value));
        } catch (IllegalArgumentException e) {
            log.error("Invalid setting key {}: {}", key, e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("Invalid setting key: " + HtmlUtils.htmlEscape(key));
        } catch (Exception e) {
            log.error("Error retrieving setting {}: {}", key, e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to retrieve setting.");
        }
    }

    @PutMapping("/key/{key}")
    @Operation(
            summary = "Update specific setting value",
            description =
                    "Update value for a specific setting key using dot notation. Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(responseCode = "200", description = "Setting updated successfully"),
                @ApiResponse(responseCode = "400", description = "Invalid setting key or value"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required"),
                @ApiResponse(responseCode = "500", description = "Failed to save setting")
            })
    public ResponseEntity<String> updateSettingValue(
            @PathVariable String key, @Valid @RequestBody UpdateSettingValueRequest request) {
        try {
            if (!isValidSettingKey(key)) {
                return ResponseEntity.badRequest()
                        .body("Invalid setting key format: " + HtmlUtils.htmlEscape(key));
            }

            Object value = request.getValue();
            log.info("Admin updating single setting: {} = {}", key, value);
            GeneralUtils.saveKeyToSettings(key, value);

            String escapedKey = HtmlUtils.htmlEscape(key);
            return ResponseEntity.ok(
                    String.format(
                            "Successfully updated setting '%s'. Changes will take effect on application restart.",
                            escapedKey));

        } catch (IOException e) {
            log.error("Failed to save setting to file: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(GENERIC_FILE_ERROR);
        } catch (IllegalArgumentException e) {
            log.error("Invalid setting key or value: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(GENERIC_INVALID_SETTING);
        } catch (Exception e) {
            log.error("Unexpected error while updating setting: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(GENERIC_SERVER_ERROR);
        }
    }

    private Object getSectionData(String sectionName) {
        if (sectionName == null || sectionName.trim().isEmpty()) {
            return null;
        }

        return switch (sectionName.toLowerCase()) {
            case "security" -> applicationProperties.getSecurity();
            case "system" -> applicationProperties.getSystem();
            case "ui" -> applicationProperties.getUi();
            case "endpoints" -> applicationProperties.getEndpoints();
            case "metrics" -> applicationProperties.getMetrics();
            case "mail" -> applicationProperties.getMail();
            case "premium" -> applicationProperties.getPremium();
            case "processexecutor", "processExecutor" -> applicationProperties.getProcessExecutor();
            case "autopipeline", "autoPipeline" -> applicationProperties.getAutoPipeline();
            case "legal" -> applicationProperties.getLegal();
            default -> null;
        };
    }

    private boolean isValidSectionName(String sectionName) {
        return getSectionData(sectionName) != null;
    }

    private static final java.util.Set<String> VALID_SECTION_NAMES =
            java.util.Set.of(
                    "security",
                    "system",
                    "ui",
                    "endpoints",
                    "metrics",
                    "mail",
                    "premium",
                    "processExecutor",
                    "processexecutor",
                    "autoPipeline",
                    "autopipeline",
                    "legal");

    // Pattern to validate safe property paths - only alphanumeric, dots, and underscores
    private static final Pattern SAFE_KEY_PATTERN = Pattern.compile("^[a-zA-Z0-9._]+$");
    private static final int MAX_NESTING_DEPTH = 10;

    // Security: Generic error messages to prevent information disclosure
    private static final String GENERIC_INVALID_SETTING = "Invalid setting key or value.";
    private static final String GENERIC_INVALID_SECTION = "Invalid section data provided.";
    private static final String GENERIC_SERVER_ERROR = "Internal server error occurred.";
    private static final String GENERIC_FILE_ERROR =
            "Failed to save settings to configuration file.";

    private boolean isValidSettingKey(String key) {
        if (key == null || key.trim().isEmpty()) {
            return false;
        }

        // Check against pattern to prevent injection attacks
        if (!SAFE_KEY_PATTERN.matcher(key).matches()) {
            return false;
        }

        // Prevent excessive nesting depth
        String[] parts = key.split("\\.");
        if (parts.length > MAX_NESTING_DEPTH) {
            return false;
        }

        // Ensure first part is a valid section name
        if (parts.length > 0 && !VALID_SECTION_NAMES.contains(parts[0].toLowerCase())) {
            return false;
        }

        return true;
    }

    private Object getSettingByKey(String key) {
        if (key == null || key.trim().isEmpty()) {
            return null;
        }

        String[] parts = key.split("\\.", 2);
        if (parts.length < 2) {
            return null;
        }

        String sectionName = parts[0];
        String propertyPath = parts[1];
        Object section = getSectionData(sectionName);

        if (section == null) {
            return null;
        }

        try {
            return getNestedProperty(section, propertyPath, 0);
        } catch (NoSuchFieldException | IllegalAccessException e) {
            log.warn("Failed to get nested property {}: {}", key, e.getMessage());
            return null;
        }
    }

    private Object getNestedProperty(Object obj, String propertyPath, int depth)
            throws NoSuchFieldException, IllegalAccessException {
        if (obj == null) {
            return null;
        }

        // Prevent excessive recursion depth
        if (depth > MAX_NESTING_DEPTH) {
            throw new IllegalAccessException("Maximum nesting depth exceeded");
        }

        try {
            // Use Jackson ObjectMapper for safer property access
            @SuppressWarnings("unchecked")
            Map<String, Object> objectMap = objectMapper.convertValue(obj, Map.class);

            String[] parts = propertyPath.split("\\.", 2);
            String currentProperty = parts[0];

            if (!objectMap.containsKey(currentProperty)) {
                throw new NoSuchFieldException("Property not found: " + currentProperty);
            }

            Object value = objectMap.get(currentProperty);

            if (parts.length == 1) {
                return value;
            } else {
                return getNestedProperty(value, parts[1], depth + 1);
            }
        } catch (IllegalArgumentException e) {
            // If Jackson fails, the property doesn't exist or isn't accessible
            throw new NoSuchFieldException("Property not accessible: " + propertyPath);
        }
    }
}
