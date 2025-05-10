package stirling.software.SPDF.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class UsernameAndPass extends Username {

    @Schema(description = "password of user", format = "password")
    private String password;
}
