package stirling.software.proprietary.mail;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@RestController
@RequiredArgsConstructor
@Slf4j
public class GmailOAuthController {

    static final String STATE_SESSION_KEY = "stirling.gmail.oauth.state";
    static final String REDIRECT_URI_SESSION_KEY = "stirling.gmail.oauth.redirect-uri";
    static final String TOKEN_SESSION_KEY = "stirling.gmail.oauth.token";
    static final String PROFILE_SESSION_KEY = "stirling.gmail.oauth.profile";

    private final GmailOAuthService gmailOAuthService;
    private final ApplicationProperties applicationProperties;
    private final SecureRandom secureRandom = new SecureRandom();

    @GetMapping("/api/v1/email/gmail/connect")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, String>> connect(HttpServletRequest request) {
        String state = randomState();
        HttpSession session = request.getSession(true);
        session.setAttribute(STATE_SESSION_KEY, state);
        String redirectUri = gmailOAuthService.resolveRedirectUri(request);
        session.setAttribute(REDIRECT_URI_SESSION_KEY, redirectUri);
        log.info(
                "Starting Gmail OAuth: requestUri={}, redirectUri={}, sessionPresent={}, forwardedHost={}, forwardedProto={}, forwardedPort={}",
                request.getRequestURI(),
                redirectUri,
                session != null,
                request.getHeader("X-Forwarded-Host"),
                request.getHeader("X-Forwarded-Proto"),
                request.getHeader("X-Forwarded-Port"));
        return ResponseEntity.ok(
                Map.of("authorizationUrl", gmailOAuthService.authorizationUrl(state, request)));
    }

    @GetMapping("/api/v1/email/gmail/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> status(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        GmailOAuthService.GmailProfile profile =
                session == null
                        ? null
                        : (GmailOAuthService.GmailProfile)
                                session.getAttribute(PROFILE_SESSION_KEY);
        return ResponseEntity.ok(
                profile == null
                        ? Map.of("connected", false)
                        : Map.of("connected", true, "email", profile.email(), "provider", "Gmail"));
    }

    @GetMapping("/api/v1/email/gmail/callback")
    public void callback(
            String code,
            String state,
            String error,
            @RequestParam(name = "error_description", required = false) String errorDescription,
            HttpServletRequest request,
            HttpServletResponse response)
            throws IOException, InterruptedException {
        log.info(
                "Received Gmail OAuth callback: requestUri={}, queryParameterNames={}, codePresent={}, statePresent={}, error={}, sessionPresent={}, forwardedHost={}, forwardedProto={}, forwardedPort={}",
                request.getRequestURI(),
                request.getParameterMap().keySet(),
                code != null && !code.isBlank(),
                state != null && !state.isBlank(),
                error,
                request.getSession(false) != null,
                request.getHeader("X-Forwarded-Host"),
                request.getHeader("X-Forwarded-Proto"),
                request.getHeader("X-Forwarded-Port"));
        if (error != null && !error.isBlank()) {
            String detail =
                    errorDescription == null || errorDescription.isBlank()
                            ? error
                            : error + ": " + errorDescription;
            response.sendError(
                    HttpServletResponse.SC_BAD_REQUEST, "Gmail OAuth was not completed: " + detail);
            return;
        }
        HttpSession session = request.getSession(false);
        String expectedState =
                session == null ? null : (String) session.getAttribute(STATE_SESSION_KEY);
        String redirectUri =
                session == null ? null : (String) session.getAttribute(REDIRECT_URI_SESSION_KEY);
        log.info(
                "Validating Gmail OAuth callback: expectedStatePresent={}, receivedStatePresent={}, stateMatches={}, redirectUriPresent={}, codePresent={}",
                expectedState != null,
                state != null && !state.isBlank(),
                expectedState != null && expectedState.equals(state),
                redirectUri != null && !redirectUri.isBlank(),
                code != null && !code.isBlank());
        if (expectedState == null
                || !expectedState.equals(state)
                || redirectUri == null
                || code == null
                || code.isBlank()) {
            response.sendError(
                    HttpServletResponse.SC_BAD_REQUEST,
                    "Invalid Gmail OAuth callback: missing or expired code/state");
            return;
        }
        GmailOAuthService.GmailToken token = gmailOAuthService.exchangeCode(code, redirectUri);
        GmailOAuthService.GmailProfile profile = gmailOAuthService.getProfile(token);
        session.removeAttribute(STATE_SESSION_KEY);
        session.removeAttribute(REDIRECT_URI_SESSION_KEY);
        session.setAttribute(TOKEN_SESSION_KEY, token);
        session.setAttribute(PROFILE_SESSION_KEY, profile);
        String frontendUrl = applicationProperties.getSystem().getFrontendUrl();
        String target =
                frontendUrl == null || frontendUrl.isBlank()
                        ? "/editor/mail?gmail=connected"
                        : frontendUrl.trim().replaceAll("/$", "") + "/editor/mail?gmail=connected";
        response.sendRedirect(target);
    }

    private String randomState() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
