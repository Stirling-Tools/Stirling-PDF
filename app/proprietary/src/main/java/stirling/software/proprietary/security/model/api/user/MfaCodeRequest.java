package stirling.software.proprietary.security.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class MfaCodeRequest {

    @Schema(description = "6-digit authentication code from your authenticator app")
    private String code;
}
