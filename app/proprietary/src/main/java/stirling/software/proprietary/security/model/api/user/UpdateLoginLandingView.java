package stirling.software.proprietary.security.model.api.user;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class UpdateLoginLandingView {

    @Schema(
            description = "Which app to open after signing in",
            allowableValues = {"editor", "processor"})
    private String loginLandingView;
}
