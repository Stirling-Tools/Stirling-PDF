package stirling.software.spdf.proprietary.security.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

import stirling.software.SPDF.model.api.user.UsernameAndPass;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class UpdateUserUsername extends UsernameAndPass {

    @Schema(description = "new password for user")
    private String newUsername;
}
