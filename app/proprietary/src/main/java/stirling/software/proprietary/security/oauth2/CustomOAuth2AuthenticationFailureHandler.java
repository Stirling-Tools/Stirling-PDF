package stirling.software.proprietary.security.oauth2;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;

@Slf4j
public class CustomOAuth2AuthenticationFailureHandler
        extends SimpleUrlAuthenticationFailureHandler {

    @Override
    @Audited(type = AuditEventType.USER_FAILED_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception)
            throws IOException, ServletException {

        if (exception instanceof BadCredentialsException) {
            log.error("BadCredentialsException", exception);
            getRedirectStrategy().sendRedirect(request, response, "/login?error=badCredentials");
            return;
        }
        if (exception instanceof DisabledException) {
            log.error("User is deactivated: ", exception);
            getRedirectStrategy().sendRedirect(request, response, "/logout?userIsDisabled=true");
            return;
        }
        if (exception instanceof LockedException) {
            log.error("Account locked: ", exception);
            getRedirectStrategy().sendRedirect(request, response, "/logout?error=locked");
            return;
        }
        if (exception instanceof OAuth2AuthenticationException oAuth2Exception) {
            OAuth2Error error = oAuth2Exception.getError();

            String errorCode = error.getErrorCode();

            if ("Password must not be null".equals(error.getErrorCode())) {
                errorCode = "userAlreadyExistsWeb";
            }

            if ("access_denied".equals(errorCode)) {
                log.info("OAuth2 Authentication cancelled: {}", errorCode);
            } else {
                log.error(
                        "OAuth2 Authentication error: {}",
                        errorCode != null ? errorCode : exception.getMessage(),
                        exception);
            }
            String safeError =
                    URLEncoder.encode(
                            errorCode != null ? errorCode : "oauth2AuthenticationError",
                            StandardCharsets.UTF_8);
            String baseRedirect =
                    extractRedirectPathFromCookie(request)
                            .orElseGet(() -> request.getContextPath() + "/auth/callback");
            String separator = baseRedirect.contains("?") ? "&" : "?";
            getRedirectStrategy()
                    .sendRedirect(
                            request,
                            response,
                            baseRedirect + separator + "errorOAuth=" + safeError);
            return;
        }
        log.error("Unhandled authentication exception", exception);
        super.onAuthenticationFailure(request, response, exception);
    }

    private Optional<String> extractRedirectPathFromCookie(HttpServletRequest request) {
        if (request.getCookies() == null) {
            return Optional.empty();
        }
        for (var cookie : request.getCookies()) {
            if ("stirling_redirect_path".equals(cookie.getName())) {
                try {
                    String decoded =
                            java.net.URLDecoder.decode(cookie.getValue(), StandardCharsets.UTF_8);
                    if (decoded != null && decoded.startsWith("/")) {
                        return Optional.of(decoded);
                    }
                } catch (Exception ignored) {
                    return Optional.empty();
                }
            }
        }
        return Optional.empty();
    }
}
