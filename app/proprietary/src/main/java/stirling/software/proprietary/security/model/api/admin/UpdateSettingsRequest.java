package stirling.software.proprietary.security.model.api.admin;

import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import lombok.Data;

@Data
@Schema(description = "Request to update multiple application settings using delta updates")
public class UpdateSettingsRequest {

    @NotNull
    @NotEmpty
    @Schema(
            description =
                    "Map of setting keys to their new values using dot notation. Only changed values need to be included for delta updates.",
            example = "{\"system.enableAnalytics\": false, \"ui.appName\": \"My PDF Tool\"}")
    private Map<String, Object> settings;
}
