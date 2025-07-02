package stirling.software.proprietary.security.model.api.admin;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Schema(description = "Response object containing a setting key and its value")
public class SettingValueResponse {

    @Schema(description = "The setting key in dot notation", example = "system.enableAnalytics")
    private String key;

    @Schema(description = "The current value of the setting", example = "true")
    private Object value;
}
