package stirling.software.proprietary.security.oauth2;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;

@Slf4j
@RequiredArgsConstructor
public class CustomOAuth2AuthenticationFailureHandler
        extends SimpleUrlAuthenticationFailureHandler {

    private static final String GENERIC_ERROR_CODE = "oauth2AuthenticationError";

    private final ApplicationProperties applicationProperties;

    @Override
    @Audited(type = AuditEventType.USER_FAILED_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception)
            throws IOException, ServletException {

        switch (exception) {
            case BadCredentialsException badCredentialsException -> {
                log.error("BadCredentialsException", exception);
                getRedirectStrategy()
                        .sendRedirect(request, response, "/login?error=badCredentials");
                return;
            }
            case DisabledException disabledException -> {
                log.error("User is deactivated: ", exception);
                getRedirectStrategy()
                        .sendRedirect(request, response, "/logout?userIsDisabled=true");
                return;
            }
            case LockedException lockedException -> {
                log.error("Account locked: ", exception);
                getRedirectStrategy().sendRedirect(request, response, "/logout?error=locked");
                return;
            }
            case OAuth2AuthenticationException oAuth2Exception -> {
                String errorCode = oAuth2Exception.getError().getErrorCode();
                log.error(
                        "OAuth2 Authentication error: {}",
                        errorCode != null ? errorCode : exception.getMessage(),
                        exception);
                redirectToCallbackWithError(
                        request, response, errorCode != null ? errorCode : GENERIC_ERROR_CODE);
                return;
            }
            default -> {
                log.error("Unhandled authentication exception", exception);
                redirectToCallbackWithError(request, response, GENERIC_ERROR_CODE);
            }
        }
    }

    private void redirectToCallbackWithError(
            HttpServletRequest request, HttpServletResponse response, String errorValue)
            throws IOException {
        clearRedirectCookie(response);
        String redirectUrl =
                OAuth2CallbackUrl.resolve(
                        request,
                        applicationProperties.getSecurity().getOauth2().getRedirectBaseUrl(),
                        applicationProperties.getSystem().getFrontendUrl());
        if (TauriOAuthUtils.isTauriState(request)) {
            String stateParam = request.getParameter("state");
            if (stateParam != null && !stateParam.isBlank()) {
                redirectUrl = appendQueryParam(redirectUrl, "state", stateParam);
                // Extract and pass nonce for CSRF validation
                String nonce = TauriOAuthUtils.extractNonceFromState(stateParam);
                if (nonce != null) {
                    redirectUrl = appendQueryParam(redirectUrl, "nonce", nonce);
                }
            }
        }
        redirectUrl = appendQueryParam(redirectUrl, "errorOAuth", errorValue);
        response.sendRedirect(redirectUrl);
    }

    private void clearRedirectCookie(HttpServletResponse response) {
        ResponseCookie cookie =
                ResponseCookie.from(TauriOAuthUtils.SPA_REDIRECT_COOKIE, "")
                        .path("/")
                        .sameSite("Lax")
                        .maxAge(0)
                        .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String appendQueryParam(String path, String key, String value) {
        if (path == null || path.isBlank()) {
            return path;
        }
        String separator = path.contains("?") ? "&" : "?";
        String encodedKey = URLEncoder.encode(key, StandardCharsets.UTF_8);
        String encodedValue = value == null ? "" : URLEncoder.encode(value, StandardCharsets.UTF_8);
        return path + separator + encodedKey + "=" + encodedValue;
    }
}
