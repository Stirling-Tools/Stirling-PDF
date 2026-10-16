package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Hidden;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SettingsApi;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

@SettingsApi
@Hidden
public class SettingsController {

    private final ApplicationProperties applicationProperties;
    private final EndpointConfiguration endpointConfiguration;
    private final String desktopToken;

    public SettingsController(
            ApplicationProperties applicationProperties,
            EndpointConfiguration endpointConfiguration,
            @Value("${STIRLING_PDF_DESKTOP_TOKEN:}") String desktopToken) {
        this.applicationProperties = applicationProperties;
        this.endpointConfiguration = endpointConfiguration;
        this.desktopToken = desktopToken;
    }

    @AutoJobPostMapping(
            value = "/update-enable-analytics",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Hidden
    public ResponseEntity<Map<String, Object>> updateApiKey(@RequestParam Boolean enabled)
            throws IOException {
        if (applicationProperties.getSystem().getEnableAnalytics() != null) {
            return ResponseEntity.status(HttpStatus.ALREADY_REPORTED)
                    .body(
                            Map.of(
                                    "message",
                                    "Setting has already been set, To adjust please edit "
                                            + InstallationPathConfig.getSettingsPath()));
        }
        GeneralUtils.saveKeyToSettings("system.enableAnalytics", enabled);
        applicationProperties.getSystem().setEnableAnalytics(enabled);
        return ResponseEntity.ok(Map.of("message", "Updated"));
    }

    @AutoJobPostMapping(
            value = "/desktop/update-enable-analytics",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Hidden
    public ResponseEntity<Map<String, Object>> updateDesktopAnalytics(
            @RequestParam Boolean enabled,
            @RequestHeader(value = "X-Stirling-Desktop-Token", required = false)
                    String presentedToken)
            throws IOException {
        if (!Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"))
                || !validDesktopToken(presentedToken)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "This setting is only available in the desktop app"));
        }

        GeneralUtils.saveKeyToSettings("system.enableAnalytics", enabled);
        applicationProperties.getSystem().setEnableAnalytics(enabled);
        return ResponseEntity.ok(Map.of("message", "Updated"));
    }

    private boolean validDesktopToken(String presentedToken) {
        return desktopToken != null
                && !desktopToken.isBlank()
                && presentedToken != null
                && MessageDigest.isEqual(
                        desktopToken.getBytes(StandardCharsets.UTF_8),
                        presentedToken.getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/get-endpoints-status")
    @Hidden
    public ResponseEntity<Map<String, Boolean>> getDisabledEndpoints() {
        return ResponseEntity.ok(endpointConfiguration.getEndpointStatuses());
    }
}
