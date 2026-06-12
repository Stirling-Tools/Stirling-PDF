package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import io.quarkus.runtime.Quarkus;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.AdminApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.AppArgsCapture;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.JarPathUtil;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.proprietary.security.model.api.admin.SettingValueResponse;
import stirling.software.proprietary.security.model.api.admin.UpdateSettingValueRequest;
import stirling.software.proprietary.security.model.api.admin.UpdateSettingsRequest;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

// @AdminApi carries only the OpenAPI @Tag under JAX-RS; the @Path the removed @RequestMapping
// supplied must be declared explicitly. Fully-qualified @jakarta.ws.rs.Path is used to avoid a
// clash with the java.nio.file.Path import.
@AdminApi
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/admin/settings")
@RolesAllowed("ADMIN")
@Slf4j
public class AdminSettingsController {

    @Inject ApplicationProperties applicationProperties;
    @Inject ObjectMapper objectMapper;

    // Track settings that have been modified but not yet applied (require restart)
    private static final ConcurrentHashMap<String, Object> pendingChanges =
            new ConcurrentHashMap<>();

    // Define specific sensitive field names that contain secret values
    private static final Set<String> SENSITIVE_FIELD_NAMES =
            new HashSet<>(
                    Arrays.asList(
                            // Passwords
                            "password",
                            "dbpassword",
                            "mailpassword",
                            "smtppassword",
                            // OAuth/API secrets
                            "clientsecret",
                            "apisecret",
                            "secret",
                            // API tokens
                            "apikey",
                            "accesstoken",
                            "refreshtoken",
                            "token",
                            // Specific secret keys (not all keys, and excluding premium.key)
                            "key", // automaticallyGenerated.key
                            "enterprisekey",
                            "licensekey"));

    @GET
    @Operation(
            summary = "Get all application settings",
            description =
                    "Retrieve all current application settings. Use includePending=true to include"
                            + " settings that will take effect after restart. Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(responseCode = "200", description = "Settings retrieved successfully"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required")
            })
    public Response getSettings(
            @QueryParam("includePending") @DefaultValue("false") boolean includePending) {
        log.debug("Admin requested all application settings (includePending={})", includePending);

        // Convert ApplicationProperties to Map
        Map<String, Object> settings =
                objectMapper.convertValue(
                        applicationProperties, new TypeReference<Map<String, Object>>() {});

        if (includePending && !pendingChanges.isEmpty()) {
            // Merge pending changes into the settings map
            settings = mergePendingChanges(settings, pendingChanges);
        }

        // Mask sensitive fields after merging
        Map<String, Object> maskedSettings = maskSensitiveFields(settings);

        return Response.ok(maskedSettings).build();
    }

    @GET
    @jakarta.ws.rs.Path("/delta")
    @Operation(
            summary = "Get pending settings changes",
            description =
                    "Retrieve settings that have been modified but not yet applied (require"
                            + " restart). Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(
                        responseCode = "200",
                        description = "Pending changes retrieved successfully"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required")
            })
    public Response getSettingsDelta() {
        Map<String, Object> response = new HashMap<>();
        // Mask sensitive fields in pending changes
        response.put("pendingChanges", maskSensitiveFields(new HashMap<>(pendingChanges)));
        response.put("hasPendingChanges", !pendingChanges.isEmpty());
        response.put("count", pendingChanges.size());

        log.debug("Admin requested pending changes - found {} settings", pendingChanges.size());
        return Response.ok(response).build();
    }

    @PUT
    @Operation(
            summary = "Update application settings (delta updates)",
            description =
                    "Update specific application settings using dot notation keys. Only sends"
                            + " changed values. Changes take effect on restart. Admin access required.")
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
    public Response updateSettings(@Valid UpdateSettingsRequest request) {
        try {
            Map<String, Object> settings = request.getSettings();
            if (settings == null || settings.isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "No settings provided to update"))
                        .build();
            }

            // Validate all settings first before applying any changes
            for (Map.Entry<String, Object> entry : settings.entrySet()) {
                String key = entry.getKey();
                Object value = entry.getValue();

                if (!isValidSettingKey(key)) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(
                                    Map.of(
                                            "error",
                                            "Invalid setting key format: " + htmlEscape(key)))
                            .build();
                }

                // Validate pipeline path settings
                String validationError = validatePipelinePathSetting(key, value);
                if (validationError != null) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(Map.of("error", htmlEscape(validationError)))
                            .build();
                }
            }

            // Apply all updates in a single transaction (load once, update all, save once)
            // This ensures nested settings like oauth2.client.* don't lose sibling values
            GeneralUtils.updateSettingsTransactional(settings);

            // Track all as pending changes
            for (Map.Entry<String, Object> entry : settings.entrySet()) {
                String key = entry.getKey();
                Object value = entry.getValue();
                log.info("Admin updating setting: {} = {}", key, value);
                pendingChanges.put(key, value != null ? value : "");
            }

            return Response.ok(
                            Map.of(
                                    "message",
                                    String.format(
                                            "Successfully updated %d setting(s). Changes will take effect on"
                                                    + " application restart.",
                                            settings.size())))
                    .build();

        } catch (IOException e) {
            log.error("Failed to save settings to file: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", GENERIC_FILE_ERROR))
                    .build();

        } catch (IllegalArgumentException e) {
            log.error("Invalid setting key or value: {}", e.getMessage(), e);
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", GENERIC_INVALID_SETTING))
                    .build();
        } catch (Exception e) {
            log.error("Unexpected error while updating settings: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", GENERIC_SERVER_ERROR))
                    .build();
        }
    }

    @GET
    @jakarta.ws.rs.Path("/section/{sectionName}")
    @Operation(
            summary = "Get specific settings section",
            description =
                    "Retrieve settings for a specific section (e.g., security, system, ui). "
                            + "By default includes pending changes with awaitingRestart flags. Admin access required.")
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
    public Response getSettingsSection(
            @PathParam("sectionName") String sectionName,
            @QueryParam("includePending") @DefaultValue("true") boolean includePending) {
        try {
            Object sectionData = getSectionData(sectionName);
            if (sectionData == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(
                                "Invalid section name: "
                                        + htmlEscape(sectionName)
                                        + ". Valid sections: "
                                        + String.join(", ", VALID_SECTION_NAMES))
                        .build();
            }

            // Convert to Map for manipulation
            @SuppressWarnings("unchecked")
            Map<String, Object> sectionMap = objectMapper.convertValue(sectionData, Map.class);

            if (includePending && !pendingChanges.isEmpty()) {
                // Add pending changes block for this section
                Map<String, Object> sectionPending = extractPendingForSection(sectionName);
                if (!sectionPending.isEmpty()) {
                    sectionMap.put("_pending", sectionPending);
                }
            }

            // Mask sensitive fields before returning to frontend
            sectionMap = maskSensitiveFields(sectionMap);

            log.debug(
                    "Admin requested settings section: {} (includePending={})",
                    sectionName,
                    includePending);
            return Response.ok(sectionMap).build();
        } catch (IllegalArgumentException e) {
            log.error("Invalid section name {}: {}", sectionName, e.getMessage(), e);
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("Invalid section name: " + htmlEscape(sectionName))
                    .build();
        } catch (Exception e) {
            log.error("Error retrieving section {}: {}", sectionName, e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Failed to retrieve section.")
                    .build();
        }
    }

    @PUT
    @jakarta.ws.rs.Path("/section/{sectionName}")
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
    public Response updateSettingsSection(
            @PathParam("sectionName") String sectionName,
            @Valid Map<String, Object> sectionData) {
        try {
            if (sectionData == null || sectionData.isEmpty()) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(Map.of("error", "No section data provided to update"))
                        .build();
            }

            if (!isValidSectionName(sectionName)) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity(
                                Map.of(
                                        "error",
                                        "Invalid section name: "
                                                + htmlEscape(sectionName)
                                                + ". Valid sections: "
                                                + String.join(", ", VALID_SECTION_NAMES)))
                        .build();
            }

            // Auto-enable premium features if license key is provided
            if ("premium".equalsIgnoreCase(sectionName) && sectionData.containsKey("key")) {
                Object keyValue = sectionData.get("key");
                if (keyValue != null && !keyValue.toString().trim().isEmpty()) {
                    // Automatically set enabled to true when a key is provided
                    sectionData.put("enabled", true);
                    log.info("Auto-enabling premium features because license key was provided");
                }
            }

            int updatedCount = 0;
            for (Map.Entry<String, Object> entry : sectionData.entrySet()) {
                String propertyKey = entry.getKey();
                String fullKey = sectionName + "." + propertyKey;
                Object value = entry.getValue();

                if (!isValidSettingKey(fullKey)) {
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(
                                    Map.of(
                                            "error",
                                            "Invalid setting key format: " + htmlEscape(fullKey)))
                            .build();
                }

                log.info("Admin updating section setting: {} = {}", fullKey, value);
                GeneralUtils.saveKeyToSettings(fullKey, value);

                // Track this as a pending change
                pendingChanges.put(fullKey, value);

                updatedCount++;
            }

            String escapedSectionName = htmlEscape(sectionName);
            return Response.ok(
                            Map.of(
                                    "message",
                                    String.format(
                                            "Successfully updated %d setting(s) in section '%s'. Changes will take"
                                                    + " effect on application restart.",
                                            updatedCount, escapedSectionName)))
                    .build();

        } catch (IOException e) {
            log.error("Failed to save section settings to file: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", GENERIC_FILE_ERROR))
                    .build();
        } catch (IllegalArgumentException e) {
            log.error("Invalid section data: {}", e.getMessage(), e);
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", GENERIC_INVALID_SECTION))
                    .build();
        } catch (Exception e) {
            log.error("Unexpected error while updating section settings: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(Map.of("error", GENERIC_SERVER_ERROR))
                    .build();
        }
    }

    @GET
    @jakarta.ws.rs.Path("/key/{key}")
    @Operation(
            summary = "Get specific setting value",
            description =
                    "Retrieve value for a specific setting key using dot notation. Admin access"
                            + " required.")
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
    public Response getSettingValue(@PathParam("key") String key) {
        try {
            if (!isValidSettingKey(key)) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity("Invalid setting key format: " + htmlEscape(key))
                        .build();
            }

            Object value = getSettingByKey(key);
            if (value == null) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity("Setting key not found: " + htmlEscape(key))
                        .build();
            }

            // Mask sensitive values before returning
            String keyName = key.contains(".") ? key.substring(key.lastIndexOf(".") + 1) : key;
            if (isSensitiveFieldWithPath(keyName, key)) {
                value = createMaskedValue(value);
            }

            log.debug("Admin requested setting: {}", key);
            return Response.ok(new SettingValueResponse(key, value)).build();
        } catch (IllegalArgumentException e) {
            log.error("Invalid setting key {}: {}", key, e.getMessage(), e);
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity("Invalid setting key: " + htmlEscape(key))
                    .build();
        } catch (Exception e) {
            log.error("Error retrieving setting {}: {}", key, e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity("Failed to retrieve setting.")
                    .build();
        }
    }

    @PUT
    @jakarta.ws.rs.Path("/key/{key}")
    @Operation(
            summary = "Update specific setting value",
            description =
                    "Update value for a specific setting key using dot notation. Admin access"
                            + " required.")
    @ApiResponses(
            value = {
                @ApiResponse(responseCode = "200", description = "Setting updated successfully"),
                @ApiResponse(responseCode = "400", description = "Invalid setting key or value"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required"),
                @ApiResponse(responseCode = "500", description = "Failed to save setting")
            })
    public Response updateSettingValue(
            @PathParam("key") String key, @Valid UpdateSettingValueRequest request) {
        try {
            if (!isValidSettingKey(key)) {
                return Response.status(Response.Status.BAD_REQUEST)
                        .entity("Invalid setting key format: " + htmlEscape(key))
                        .build();
            }

            Object value = request.getValue();

            // Prevent saving masked values for sensitive fields to avoid data loss
            if ("********".equals(value)) {
                String keyName = key.contains(".") ? key.substring(key.lastIndexOf(".") + 1) : key;
                if (isSensitiveFieldWithPath(keyName, key)) {
                    log.warn(
                            "Admin attempted to save masked value for sensitive field: {}. This operation is blocked to prevent data loss.",
                            key);
                    return Response.status(Response.Status.BAD_REQUEST)
                            .entity(
                                    "Cannot save masked values for sensitive settings. Please provide the actual value.")
                            .build();
                }
            }

            log.info("Admin updating single setting: {} = {}", key, value);
            GeneralUtils.saveKeyToSettings(key, value);

            // Track this as a pending change
            pendingChanges.put(key, value);

            String escapedKey = htmlEscape(key);
            return Response.ok(
                            String.format(
                                    "Successfully updated setting '%s'. Changes will take effect on"
                                            + " application restart.",
                                    escapedKey))
                    .build();

        } catch (IOException e) {
            log.error("Failed to save setting to file: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(GENERIC_FILE_ERROR)
                    .build();
        } catch (IllegalArgumentException e) {
            log.error("Invalid setting key or value: {}", e.getMessage(), e);
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(GENERIC_INVALID_SETTING)
                    .build();
        } catch (Exception e) {
            log.error("Unexpected error while updating setting: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(GENERIC_SERVER_ERROR)
                    .build();
        }
    }

    @POST
    @jakarta.ws.rs.Path("/restart")
    @Operation(
            summary = "Restart the application",
            description =
                    "Triggers a graceful restart of the application to apply pending settings changes. Uses a restart helper to ensure proper restart. Admin access required.")
    @ApiResponses(
            value = {
                @ApiResponse(responseCode = "200", description = "Restart initiated successfully"),
                @ApiResponse(
                        responseCode = "403",
                        description = "Access denied - Admin role required"),
                @ApiResponse(responseCode = "500", description = "Failed to initiate restart")
            })
    public Response restartApplication() {
        try {
            log.warn("Admin initiated application restart");

            // Get paths to current JAR and restart helper
            Path appJar = JarPathUtil.currentJar();
            Path helperJar = JarPathUtil.restartHelperJar();

            if (appJar == null) {
                log.error("Cannot restart: not running from JAR (likely development mode)");
                return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                        .entity(
                                Map.of(
                                        "error",
                                        "Restart not available in development mode. Please restart the application manually."))
                        .build();
            }

            if (helperJar == null || !Files.isRegularFile(helperJar)) {
                log.error("Cannot restart: restart-helper.jar not found at expected location");
                return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                        .entity(
                                Map.of(
                                        "error",
                                        "Restart helper not found. Cannot perform application restart."))
                        .build();
            }

            // Get current application arguments
            List<String> appArgs = AppArgsCapture.APP_ARGS.get();

            // Write args to temp file to avoid command-line quoting issues
            Path argsFile = Files.createTempFile("stirling-app-args-", ".txt");
            Files.write(argsFile, appArgs, StandardCharsets.UTF_8);

            // Get current process PID and java executable
            long pid = ProcessHandle.current().pid();
            String javaBin = JarPathUtil.javaExecutable();

            // Build command to launch restart helper
            List<String> cmd = new ArrayList<>();
            cmd.add(javaBin);
            cmd.add("-jar");
            cmd.add(helperJar.toString());
            cmd.add("--pid");
            cmd.add(Long.toString(pid));
            cmd.add("--app");
            cmd.add(appJar.toString());
            cmd.add("--argsFile");
            cmd.add(argsFile.toString());
            cmd.add("--backoffMs");
            cmd.add("1000");

            log.info("Launching restart helper: {}", String.join(" ", cmd));

            // Launch restart helper process
            new ProcessBuilder(cmd)
                    .directory(appJar.getParent().toFile())
                    .inheritIO() // Forward logs
                    .start();

            // Clear pending changes since we're restarting
            pendingChanges.clear();

            // Give the HTTP response time to complete, then exit
            Thread.ofVirtual()
                    .start(
                            () -> {
                                try {
                                    Thread.sleep(1000);
                                    log.info("Shutting down for restart...");
                                    // Trigger a graceful Quarkus shutdown (fires ShutdownEvent /
                                    // @PreDestroy); equivalent to SpringApplication.exit(context).
                                    Quarkus.asyncExit(0);
                                } catch (InterruptedException e) {
                                    log.error("Restart interrupted: {}", e.getMessage(), e);
                                    Thread.currentThread().interrupt();
                                }
                            });

            return Response.ok(
                            Map.of(
                                    "message",
                                    "Application restart initiated. The server will be back online shortly."))
                    .build();

        } catch (Exception e) {
            log.error("Failed to initiate restart: {}", e.getMessage(), e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                    .entity(
                            Map.of(
                                    "error",
                                    "Failed to initiate application restart: " + e.getMessage()))
                    .build();
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
            case "storage" -> applicationProperties.getStorage();
            case "premium" -> applicationProperties.getPremium();
            case "processexecutor", "processExecutor" -> applicationProperties.getProcessExecutor();
            case "autopipeline", "autoPipeline" -> applicationProperties.getAutoPipeline();
            case "legal" -> applicationProperties.getLegal();
            case "telegram" -> applicationProperties.getTelegram();
            case "aiengine", "aiEngine" -> applicationProperties.getAiEngine();
            case "mcp" -> applicationProperties.getMcp();
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
                    "storage",
                    "premium",
                    "processExecutor",
                    "processexecutor",
                    "autoPipeline",
                    "autopipeline",
                    "legal",
                    "telegram",
                    "aiEngine",
                    "aiengine",
                    "mcp");

    // Pattern to validate safe property paths - only alphanumeric, dots, and underscores
    private static final Pattern SAFE_KEY_PATTERN =
            RegexPatternUtils.getInstance().getPattern("^[a-zA-Z0-9._]+$");
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

    private String validatePipelinePathSetting(String key, Object value) {
        // Validate pipeline path settings
        if (key.startsWith("system.customPaths.pipeline.watchedFoldersDirs")
                && value instanceof java.util.List) {
            @SuppressWarnings("unchecked")
            java.util.List<String> paths = (java.util.List<String>) value;

            // Check for empty or all-blank paths
            if (paths.isEmpty()) {
                return null; // Empty is OK, will use default
            }

            // Validate each path
            java.util.Set<String> normalizedPaths = new java.util.HashSet<>();
            for (String path : paths) {
                if (path != null && !path.trim().isEmpty()) {
                    try {
                        java.nio.file.Path normalized =
                                java.nio.file.Paths.get(path.trim()).toAbsolutePath().normalize();
                        String normalizedStr = normalized.toString();

                        // Check for duplicates
                        if (normalizedPaths.contains(normalizedStr)) {
                            return "Duplicate path detected: " + path;
                        }
                        normalizedPaths.add(normalizedStr);
                    } catch (java.nio.file.InvalidPathException e) {
                        return "Invalid path: " + path + " - " + e.getMessage();
                    }
                }
            }

            // Check for overlapping paths
            java.util.List<String> pathList = new java.util.ArrayList<>(normalizedPaths);
            for (int i = 0; i < pathList.size(); i++) {
                java.nio.file.Path path1 = java.nio.file.Paths.get(pathList.get(i));
                for (int j = i + 1; j < pathList.size(); j++) {
                    java.nio.file.Path path2 = java.nio.file.Paths.get(pathList.get(j));
                    if (path1.startsWith(path2) || path2.startsWith(path1)) {
                        return "Overlapping paths detected: " + path1 + " and " + path2;
                    }
                }
            }
        }

        return null; // Valid
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

    /**
     * Recursively mask sensitive fields in settings map. Sensitive fields are replaced with a
     * status indicator showing if they're configured.
     */
    private Map<String, Object> maskSensitiveFields(Map<String, Object> settings) {
        return maskSensitiveFieldsWithPath(settings, "");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> maskSensitiveFieldsWithPath(
            Map<String, Object> settings, String path) {
        Map<String, Object> masked = new HashMap<>();

        for (Map.Entry<String, Object> entry : settings.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            String currentPath = path.isEmpty() ? key : path + "." + key;

            if (value instanceof Map) {
                // Recursively mask nested objects
                masked.put(
                        key, maskSensitiveFieldsWithPath((Map<String, Object>) value, currentPath));
            } else if (isSensitiveFieldWithPath(key, currentPath)) {
                // Mask sensitive fields with status indicator
                masked.put(key, createMaskedValue(value));
            } else {
                // Keep non-sensitive fields as-is
                masked.put(key, value);
            }
        }

        return masked;
    }

    /** Check if a field name indicates sensitive data with full path context */
    private boolean isSensitiveFieldWithPath(String fieldName, String fullPath) {
        String lowerField = fieldName.toLowerCase();
        String lowerPath = fullPath.toLowerCase();

        // Don't mask premium.key specifically
        if ("key".equals(lowerField) && "premium.key".equals(lowerPath)) {
            return false;
        }

        // Direct match with sensitive field names
        if (SENSITIVE_FIELD_NAMES.contains(lowerField)) {
            return true;
        }

        // Check for fields containing 'password' or 'secret'
        return lowerField.contains("password") || lowerField.contains("secret");
    }

    /** Create a masked representation for sensitive fields */
    private Object createMaskedValue(Object originalValue) {
        if (originalValue == null
                || (originalValue instanceof String && ((String) originalValue).trim().isEmpty())) {
            return originalValue; // Keep empty/null values as-is
        } else {
            return "********";
        }
    }

    /** Merge pending changes into the settings map using dot notation keys */
    @SuppressWarnings("unchecked")
    private Map<String, Object> mergePendingChanges(
            Map<String, Object> settings, Map<String, Object> pendingChanges) {
        // Create a deep copy of the settings to avoid modifying the original
        Map<String, Object> mergedSettings = new HashMap<>(settings);

        for (Map.Entry<String, Object> pendingEntry : pendingChanges.entrySet()) {
            String dotNotationKey = pendingEntry.getKey();
            Object pendingValue = pendingEntry.getValue();

            // Split the dot notation key into parts
            String[] keyParts = dotNotationKey.split("\\.");

            // Navigate to the parent object and set the value
            Map<String, Object> currentMap = mergedSettings;

            // Navigate through all parts except the last one
            for (int i = 0; i < keyParts.length - 1; i++) {
                String keyPart = keyParts[i];

                // Get or create the nested map
                Object nested = currentMap.get(keyPart);
                if (!(nested instanceof Map)) {
                    // Create a new nested map if it doesn't exist or isn't a map
                    nested = new HashMap<String, Object>();
                    currentMap.put(keyPart, nested);
                }
                currentMap = (Map<String, Object>) nested;
            }

            // Set the final value
            String finalKey = keyParts[keyParts.length - 1];
            currentMap.put(finalKey, pendingValue);
        }

        return mergedSettings;
    }

    /**
     * Extract pending changes for a specific section
     *
     * @param sectionName The section name (e.g., "security", "system")
     * @return Map of pending changes with nested structure for this section
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> extractPendingForSection(String sectionName) {
        Map<String, Object> result = new HashMap<>();
        String sectionPrefix = sectionName.toLowerCase() + ".";

        // Find all pending changes for this section
        for (Map.Entry<String, Object> entry : pendingChanges.entrySet()) {
            String pendingKey = entry.getKey();

            if (pendingKey.toLowerCase().startsWith(sectionPrefix)) {
                // Extract the path within the section (e.g., "security.enableLogin" ->
                // "enableLogin")
                String pathInSection = pendingKey.substring(sectionPrefix.length());
                Object pendingValue = entry.getValue();

                // Build nested structure from dot notation
                setNestedValue(result, pathInSection, pendingValue);
            }
        }

        return result;
    }

    /**
     * Set a value in a nested map using dot notation
     *
     * @param map The root map
     * @param dotPath The dot notation path (e.g., "oauth2.clientSecret")
     * @param value The value to set
     */
    @SuppressWarnings("unchecked")
    private void setNestedValue(Map<String, Object> map, String dotPath, Object value) {
        String[] parts = dotPath.split("\\.");
        Map<String, Object> current = map;

        // Navigate/create nested maps for all parts except the last
        for (int i = 0; i < parts.length - 1; i++) {
            String part = parts[i];
            Object nested = current.get(part);

            if (!(nested instanceof Map)) {
                nested = new HashMap<String, Object>();
                current.put(part, nested);
            }

            current = (Map<String, Object>) nested;
        }

        // Set the final value
        current.put(parts[parts.length - 1], value);
    }

    // Replacement for Spring's org.springframework.web.util.HtmlUtils.htmlEscape (no
    // Quarkus/Jakarta equivalent and commons-text is not a dependency). Mirrors the subset of
    // behavior required to escape user-supplied keys/section names echoed into error messages.
    private static String htmlEscape(String input) {
        if (input == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&#39;");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }
}
