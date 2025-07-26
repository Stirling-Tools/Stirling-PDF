package stirling.software.proprietary.security.model.api.admin;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Response containing a setting key and its current value")
public class SettingValueResponse {

    @Schema(
            description = "The setting key in dot notation (e.g., 'system.enableAnalytics')",
            example = "system.enableAnalytics")
    private String key;

    @Schema(description = "The current value of the setting", example = "true")
    private Object value;
}
