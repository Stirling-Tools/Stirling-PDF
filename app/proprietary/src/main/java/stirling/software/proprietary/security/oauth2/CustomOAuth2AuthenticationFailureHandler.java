package stirling.software.proprietary.security.oauth2;

import java.io.IOException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;

@Slf4j
public class CustomOAuth2AuthenticationFailureHandler
        extends SimpleUrlAuthenticationFailureHandler {

    private static final String SPA_REDIRECT_COOKIE = "stirling_redirect_path";
    private static final String DEFAULT_CALLBACK_PATH = "/auth/callback";
    private static final String TAURI_SESSION_KEY = "stirling_tauri_oauth";

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

            log.error(
                    "OAuth2 Authentication error: {}",
                    errorCode != null ? errorCode : exception.getMessage(),
                    exception);
            String errorValue = errorCode != null ? errorCode : "oauth2AuthenticationError";
            clearRedirectCookie(response);
            boolean tauriState = isTauriState(request);
            String redirectUrl;
            if (tauriState) {
                String basePath = defaultTauriCallbackPath(request.getContextPath());
                redirectUrl = basePath;
                String stateParam = request.getParameter("state");
                if (stateParam != null && !stateParam.isBlank()) {
                    redirectUrl = appendQueryParam(redirectUrl, "state", stateParam);
                }
                redirectUrl = appendQueryParam(redirectUrl, "errorOAuth", errorValue);
            } else {
                redirectUrl = buildFailureRedirectUrl(request, errorValue);
            }
            getRedirectStrategy().sendRedirect(request, response, redirectUrl);
            return;
        }
        log.error("Unhandled authentication exception", exception);
        super.onAuthenticationFailure(request, response, exception);
    }

    private String buildFailureRedirectUrl(HttpServletRequest request, String errorValue) {
        String contextPath = request.getContextPath();
        String redirectPath =
                extractRedirectPathFromCookie(request)
                        .orElseGet(() -> defaultCallbackPath(contextPath));
        if (isTauriSession(request) || isTauriState(request)) {
            redirectPath = appendQueryParam(redirectPath, "tauri", "1");
        }
        String resolvedPath =
                redirectPath.startsWith("/")
                        ? normalizeContextPath(contextPath) + redirectPath
                        : normalizeContextPath(contextPath) + "/" + redirectPath;
        return appendQueryParam(resolvedPath, "errorOAuth", errorValue);
    }

    private Optional<String> extractRedirectPathFromCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        for (Cookie cookie : cookies) {
            if (SPA_REDIRECT_COOKIE.equals(cookie.getName())) {
                String value = URLDecoder.decode(cookie.getValue(), StandardCharsets.UTF_8).trim();
                if (!value.isEmpty()) {
                    return Optional.of(value);
                }
            }
        }
        return Optional.empty();
    }

    private String defaultCallbackPath(String contextPath) {
        if (contextPath == null
                || contextPath.isBlank()
                || "/".equals(contextPath)
                || "\\".equals(contextPath)) {
            return DEFAULT_CALLBACK_PATH;
        }
        return contextPath + DEFAULT_CALLBACK_PATH;
    }

    private String defaultTauriCallbackPath(String contextPath) {
        String base = defaultCallbackPath(contextPath);
        return base + "/tauri";
    }

    private String normalizeContextPath(String contextPath) {
        if (contextPath == null || contextPath.isBlank() || "/".equals(contextPath)) {
            return "";
        }
        return contextPath;
    }

    private void clearRedirectCookie(HttpServletResponse response) {
        ResponseCookie cookie =
                ResponseCookie.from(SPA_REDIRECT_COOKIE, "")
                        .path("/")
                        .sameSite("Lax")
                        .maxAge(0)
                        .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private boolean isTauriSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return false;
        }
        Object value = session.getAttribute(TAURI_SESSION_KEY);
        session.removeAttribute(TAURI_SESSION_KEY);
        return Boolean.TRUE.equals(value);
    }

    private boolean isTauriState(HttpServletRequest request) {
        String state = request.getParameter("state");
        return state != null && state.startsWith("tauri:");
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
