package stirling.software.proprietary.security.model.api.admin;

import jakarta.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
@Schema(description = "Request object for updating a single setting value")
public class UpdateSettingValueRequest {

    @NotNull(message = "Setting value cannot be null")
    @Schema(description = "The new value for the setting", example = "true", required = true)
    private Object value;
}
