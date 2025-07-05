package stirling.software.proprietary.security.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class Username {

    @Schema(description = "username of user", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull
    private String username;
}
