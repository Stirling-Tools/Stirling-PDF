package stirling.software.proprietary.security.model.api.admin;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
@Schema(description = "Request object for updating a single setting value")
public class UpdateSettingValueRequest {

    @Schema(description = "The new value for the setting", example = "true")
    private Object value;
}
