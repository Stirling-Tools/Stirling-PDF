package stirling.software.proprietary.security.oauth2;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;

// TODO: Migration required - this class previously extended Spring Security's
// SimpleUrlAuthenticationFailureHandler and was wired into the OAuth2 login flow as the
// failure handler. quarkus-oidc has no direct equivalent for a servlet
// AuthenticationFailureHandler. Under quarkus-oidc the failure path should be handled via
// quarkus.oidc.* config (e.g. quarkus.oidc.authentication.error-path) plus a
// jakarta.ws.rs.ext.ExceptionMapper / SecurityIdentityAugmentor or a redirect filter that
// inspects the OIDC error and applies the same redirect logic below. The redirect-building
// logic (Tauri handling, cookie clearing, query-param construction) is preserved here as a
// reusable bean; rewire the actual failure dispatch to call onAuthenticationFailure(...) once
// the quarkus-oidc wiring is in place. The original Spring exception types
// (BadCredentialsException / DisabledException / LockedException / OAuth2AuthenticationException
// + OAuth2Error) were used to branch on the failure cause and must be re-mapped to the
// quarkus-oidc equivalents (io.quarkus.oidc / io.quarkus.security exceptions).
@Slf4j
@ApplicationScoped
public class CustomOAuth2AuthenticationFailureHandler {

    @Audited(type = AuditEventType.USER_FAILED_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationFailure(
            HttpServletRequest request, HttpServletResponse response, Exception exception)
            throws IOException, ServletException {

        // TODO: Migration required - the original handler branched on Spring Security exception
        // types to choose a redirect target:
        //   BadCredentialsException -> "/login?error=badCredentials"
        //   DisabledException       -> "/logout?userIsDisabled=true"
        //   LockedException         -> "/logout?error=locked"
        //   OAuth2AuthenticationException (with OAuth2Error.getErrorCode()) -> OAuth2 error flow
        // Re-map these branches to the corresponding quarkus-oidc / io.quarkus.security failure
        // causes. The OAuth2 error-code handling below is preserved but the error code can no
        // longer be extracted from OAuth2Error and must be sourced from the OIDC failure context.

        String errorCode = null;
        if ("Password must not be null".equals(errorCode)) {
            errorCode = "userAlreadyExistsWeb";
        }

        log.error(
                "OAuth2 Authentication error: {}",
                errorCode != null ? errorCode : exception.getMessage(),
                exception);
        String errorValue = errorCode != null ? errorCode : "oauth2AuthenticationError";
        clearRedirectCookie(response);
        boolean tauriState = TauriOAuthUtils.isTauriState(request);
        String redirectUrl;
        if (tauriState) {
            String basePath = TauriOAuthUtils.defaultTauriCallbackPath(request.getContextPath());
            redirectUrl = basePath;
            String stateParam = request.getParameter("state");
            if (stateParam != null && !stateParam.isBlank()) {
                redirectUrl = appendQueryParam(redirectUrl, "state", stateParam);
                // Extract and pass nonce for CSRF validation
                String nonce = TauriOAuthUtils.extractNonceFromState(stateParam);
                if (nonce != null) {
                    redirectUrl = appendQueryParam(redirectUrl, "nonce", nonce);
                }
            }
            redirectUrl = appendQueryParam(redirectUrl, "errorOAuth", errorValue);
        } else {
            redirectUrl = buildFailureRedirectUrl(request, errorValue);
        }
        response.sendRedirect(redirectUrl);
    }

    private String buildFailureRedirectUrl(HttpServletRequest request, String errorValue) {
        String contextPath = request.getContextPath();
        String cookiePath = TauriOAuthUtils.extractRedirectPathFromCookie(request);
        String redirectPath =
                cookiePath != null ? cookiePath : TauriOAuthUtils.defaultCallbackPath(contextPath);
        if (TauriOAuthUtils.isTauriState(request)) {
            redirectPath = appendQueryParam(redirectPath, "tauri", "1");
        }
        String resolvedPath =
                redirectPath.startsWith("/")
                        ? TauriOAuthUtils.normalizeContextPath(contextPath) + redirectPath
                        : TauriOAuthUtils.normalizeContextPath(contextPath) + "/" + redirectPath;
        return appendQueryParam(resolvedPath, "errorOAuth", errorValue);
    }

    private void clearRedirectCookie(HttpServletResponse response) {
        // Replaces Spring's ResponseCookie/HttpHeaders.SET_COOKIE with a plain servlet header.
        String cookie =
                TauriOAuthUtils.SPA_REDIRECT_COOKIE + "=; Path=/; Max-Age=0; SameSite=Lax";
        response.addHeader("Set-Cookie", cookie);
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
