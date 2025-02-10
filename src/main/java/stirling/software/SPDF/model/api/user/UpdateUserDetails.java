package stirling.software.SPDF.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class UpdateUserDetails extends UpdateUserUsername {

    @Schema(description = "new password for user")
    private String newPassword;
}
