package stirling.software.SPDF.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class UpdateUserDetails extends UpdateUserUsername {

    @Schema(
            description = "new password for user",
            format = "password",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String newPassword;
}
