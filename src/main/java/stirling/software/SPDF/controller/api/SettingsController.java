package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.InstallationPathConfig;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.GeneralUtils;

@Controller
@Tag(name = "Settings", description = "Settings APIs")
@RequestMapping("/api/v1/settings")
@RequiredArgsConstructor
@Hidden
public class SettingsController {

    private final ApplicationProperties applicationProperties;
    private final EndpointConfiguration endpointConfiguration;

    @PostMapping("/update-enable-analytics")
    @Hidden
    public ResponseEntity<String> updateApiKey(@RequestBody Boolean enabled) throws IOException {
        if (applicationProperties.getSystem().getEnableAnalytics() != null) {
            return ResponseEntity.status(HttpStatus.ALREADY_REPORTED)
                    .body(
                            "Setting has already been set, To adjust please edit "
                                    + InstallationPathConfig.getSettingsPath());
        }
        GeneralUtils.saveKeyToSettings("system.enableAnalytics", enabled);
        applicationProperties.getSystem().setEnableAnalytics(enabled);
        return ResponseEntity.ok("Updated");
    }

    @GetMapping("/get-endpoints-status")
    @Hidden
    public ResponseEntity<Map<String, Boolean>> getDisabledEndpoints() {
        return ResponseEntity.ok(endpointConfiguration.getEndpointStatuses());
    }
}
