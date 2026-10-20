package stirling.software.SPDF.controller.web;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.Operation;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.InfoApi;

@InfoApi
@Slf4j
public class StatusController {

    @GetMapping("/status")
    @Operation(
            summary = "Application status and version",
            description =
                    "This endpoint returns the status of the application and its version number.")
    public ResponseEntity<?> getStatus() {
        return getApplicationStatus();
    }

    @GetMapping("/health")
    @Operation(
            summary = "Application health check",
            description =
                    "This endpoint returns the health status of the application and its version number. Mirrors /api/v1/info/status.")
    public ResponseEntity<?> getHealth() {
        return getApplicationStatus();
    }

    private ResponseEntity<?> getApplicationStatus() {
        Map<String, String> status = new HashMap<>();
        status.put("status", "UP");
        String version = getClass().getPackage().getImplementationVersion();
        if (version == null) {
            version = getVersionFromProperties();
        }
        status.put("version", version);
        return ResponseEntity.ok(status);
    }

    private String getVersionFromProperties() {
        try (InputStream is = getClass().getResourceAsStream("/version.properties")) {
            if (is != null) {
                Properties props = new Properties();
                props.load(is);
                return props.getProperty("version");
            }
        } catch (IOException e) {
            log.error("Failed to load version.properties", e);
        }
        return null;
    }
}
