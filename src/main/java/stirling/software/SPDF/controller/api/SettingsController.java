package stirling.software.SPDF.controller.api;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.utils.GeneralUtils;

@Controller
@Tag(name = "Settings", description = "Settings APIs")
@RequestMapping("/api/v1/settings")
@Hidden
public class SettingsController {

    @Autowired ApplicationProperties applicationProperties;

    @PostMapping("/update-enable-analytics")
    @Hidden
    public ResponseEntity<String> updateApiKey(@RequestBody Boolean enabled) throws IOException {
        if (!"undefined".equals(applicationProperties.getSystem().getEnableAnalytics())) {
            return ResponseEntity.status(HttpStatus.ALREADY_REPORTED)
                    .body(
                            "Setting has already been set, To adjust please edit /config/settings.yml");
        }
        GeneralUtils.saveKeyToConfig("system.enableAnalytics", String.valueOf(enabled), false);
        applicationProperties.getSystem().setEnableAnalytics(String.valueOf(enabled));
        return ResponseEntity.ok("Updated");
    }
}
