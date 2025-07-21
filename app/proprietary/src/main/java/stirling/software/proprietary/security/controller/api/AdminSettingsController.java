package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.util.Map;

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

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

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

    private static final java.util.Set<String> VALID_SECTIONS =
            java.util.Set.of(
                    "security",
                    "system",
                    "ui",
                    "endpoints",
                    "metrics",
                    "mail",
                    "premium",
                    "processExecutor",
                    "autoPipeline",
                    "legal");

    private final ApplicationProperties applicationProperties;

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

            int updatedCount = 0;
            for (Map.Entry<String, Object> entry : settings.entrySet()) {
                String key = entry.getKey();
                Object value = entry.getValue();

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
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to save settings to configuration file.");

        } catch (Exception e) {
            log.error("Unexpected error while updating settings: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("Invalid setting key or value.");
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
                                        + ". Valid sections: security, system, ui, endpoints, metrics, mail, premium, processExecutor, autoPipeline, legal");
            }
            log.debug("Admin requested settings section: {}", sectionName);
            return ResponseEntity.ok(sectionData);
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
                                        + ". Valid sections: security, system, ui, endpoints, metrics, mail, premium, processExecutor, autoPipeline, legal");
            }

            int updatedCount = 0;
            for (Map.Entry<String, Object> entry : sectionData.entrySet()) {
                String key = sectionName + "." + entry.getKey();
                Object value = entry.getValue();

                log.info("Admin updating section setting: {} = {}", key, value);
                GeneralUtils.saveKeyToSettings(key, value);
                updatedCount++;
            }

            String escapedSectionName = HtmlUtils.htmlEscape(sectionName);
            return ResponseEntity.ok(
                    String.format(
                            "Successfully updated %d setting(s) in section '%s'. Changes will take effect on application restart.",
                            updatedCount, escapedSectionName));

        } catch (IOException e) {
            log.error("Failed to save section settings to file: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to save settings to configuration file.");
        } catch (Exception e) {
            log.error("Unexpected error while updating section settings: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid section data.");
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
            Object value = getSettingByKey(key);
            if (value == null) {
                return ResponseEntity.badRequest()
                        .body("Setting key not found: " + HtmlUtils.htmlEscape(key));
            }
            log.debug("Admin requested setting: {}", key);
            return ResponseEntity.ok(new SettingValueResponse(key, value));
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
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to save setting to configuration file.");
        } catch (Exception e) {
            log.error("Unexpected error while updating setting: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body("Invalid setting key or value.");
        }
    }

    private Object getSectionData(String sectionName) {
        return switch (sectionName.toLowerCase()) {
            case "security" -> applicationProperties.getSecurity();
            case "system" -> applicationProperties.getSystem();
            case "ui" -> applicationProperties.getUi();
            case "endpoints" -> applicationProperties.getEndpoints();
            case "metrics" -> applicationProperties.getMetrics();
            case "mail" -> applicationProperties.getMail();
            case "premium" -> applicationProperties.getPremium();
            case "processexecutor" -> applicationProperties.getProcessExecutor();
            case "autopipeline" -> applicationProperties.getAutoPipeline();
            case "legal" -> applicationProperties.getLegal();
            default -> null;
        };
    }

    private boolean isValidSectionName(String sectionName) {
        return getSectionData(sectionName) != null;
    }

    private Object getSettingByKey(String key) {
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
            return getNestedProperty(section, propertyPath);
        } catch (Exception e) {
            log.warn("Failed to get nested property {}: {}", key, e.getMessage());
            return null;
        }
    }

    private Object getNestedProperty(Object obj, String propertyPath) throws Exception {
        if (obj == null) {
            return null;
        }

        String[] parts = propertyPath.split("\\.", 2);
        String currentProperty = parts[0];

        java.lang.reflect.Field field = obj.getClass().getDeclaredField(currentProperty);
        field.setAccessible(true);
        Object value = field.get(obj);

        if (parts.length == 1) {
            return value;
        } else {
            return getNestedProperty(value, parts[1]);
        }
    }
}
