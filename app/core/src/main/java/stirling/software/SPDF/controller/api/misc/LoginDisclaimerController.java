package stirling.software.SPDF.controller.api.misc;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.ConfigApi;
import stirling.software.common.service.LoginAgreementService;

/**
 * Serves the login agreement / disclaimer for the frontend. Public (same access as other config
 * endpoints) so it works before and during login as well as in anonymous mode. The text is read
 * live from disk, so admin edits take effect on the next login without a restart.
 */
@ConfigApi
@Hidden
@RequiredArgsConstructor
public class LoginDisclaimerController {

    private final LoginAgreementService loginAgreementService;

    @GetMapping("/login-disclaimer")
    @Operation(
            summary = "Get the login agreement/disclaimer",
            description =
                    "Returns whether the login agreement is enabled and, if so, the markdown to"
                            + " display for the requested language.")
    public LoginDisclaimerResponse getLoginDisclaimer(
            @RequestParam(name = "lang", required = false) String lang) {
        boolean enabled = loginAgreementService.isEnabled();
        boolean showInAnonymousMode = loginAgreementService.isShowInAnonymousMode();
        if (!enabled) {
            return new LoginDisclaimerResponse(false, showInAnonymousMode, "", "markdown");
        }
        String content = loginAgreementService.resolveContent(lang);
        return new LoginDisclaimerResponse(true, showInAnonymousMode, content, "markdown");
    }

    public record LoginDisclaimerResponse(
            boolean enabled, boolean showInAnonymousMode, String content, String format) {}
}
