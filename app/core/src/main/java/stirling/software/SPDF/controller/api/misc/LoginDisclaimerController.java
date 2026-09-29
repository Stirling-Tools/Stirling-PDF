package stirling.software.SPDF.controller.api.misc;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.ConfigApi;
import stirling.software.common.service.LoginAgreementService;

/**
 * Serves the login agreement / disclaimer for the frontend. Shares the /api/v1/config access rules:
 * it requires authentication when login is enabled (the modal is shown after login, never on the
 * login screen) and is permit-all in anonymous/no-login mode and in SaaS. The text is read live
 * from disk, so admin edits take effect on the next login without a restart.
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
        boolean showInAnonymousMode = loginAgreementService.isShowInAnonymousMode();
        if (!loginAgreementService.isEnabled()) {
            return new LoginDisclaimerResponse(false, showInAnonymousMode, "", "markdown");
        }
        String content = loginAgreementService.resolveContent(lang);
        // Enabled but no resolvable text (no file for any candidate locale and no fallbackText):
        // report disabled so clients don't try to render an empty agreement.
        boolean hasContent = content != null && !content.isBlank();
        return new LoginDisclaimerResponse(
                hasContent, showInAnonymousMode, hasContent ? content : "", "markdown");
    }

    public record LoginDisclaimerResponse(
            boolean enabled, boolean showInAnonymousMode, String content, String format) {}
}
