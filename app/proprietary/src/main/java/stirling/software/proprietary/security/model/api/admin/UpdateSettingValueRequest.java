package stirling.software.proprietary.security.model.api.admin;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;

@Data
@Schema(description = "Request to update a single setting value")
public class UpdateSettingValueRequest {

    @NotNull
    @Schema(description = "The new value for the setting", example = "false")
    private Object value;
}
