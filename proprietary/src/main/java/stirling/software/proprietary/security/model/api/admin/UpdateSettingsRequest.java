package stirling.software.proprietary.security.model.api.admin;

import java.util.Map;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
@Schema(
        description =
                "Request object for delta updates to application settings. Only include the settings you want to change. Uses dot notation for nested properties (e.g., 'system.enableAnalytics', 'ui.appName')")
public class UpdateSettingsRequest {

    @NotNull(message = "Settings map cannot be null")
    @NotEmpty(message = "Settings map cannot be empty")
    @Schema(
            description =
                    "Map of setting keys to their new values. Only include changed settings (delta updates). Keys use dot notation for nested properties.",
            example =
                    "{\n"
                            + "  \"system.enableAnalytics\": true,\n"
                            + "  \"ui.appName\": \"My Custom PDF Tool\",\n"
                            + "  \"security.enableLogin\": false\n"
                            + "}",
            required = true)
    private Map<String, Object> settings;
}
