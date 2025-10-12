package stirling.software.proprietary.security.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class UsernameAndPass extends Username {

    @Schema(
            description = "password of user",
            format = "password",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String password;
}
