package stirling.software.proprietary.security.saml2;

import java.io.IOException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.authentication.ProviderNotFoundException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.saml2.core.Saml2Error;
import org.springframework.security.saml2.provider.service.authentication.Saml2AuthenticationException;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.oauth2.TauriOAuthUtils;

@Slf4j
@ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
public class CustomSaml2AuthenticationFailureHandler extends SimpleUrlAuthenticationFailureHandler {

    @Override
    @Audited(type = AuditEventType.USER_FAILED_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception)
            throws IOException {
        log.error("Authentication error", exception);

        if (exception instanceof Saml2AuthenticationException) {
            Saml2Error error = ((Saml2AuthenticationException) exception).getSaml2Error();
            if (TauriSamlUtils.isTauriRelayState(request)) {
                String redirectUrl =
                        TauriOAuthUtils.defaultTauriCallbackPath(request.getContextPath());
                String nonce = TauriSamlUtils.extractNonceFromRequest(request);
                if (nonce != null) {
                    redirectUrl = appendQueryParam(redirectUrl, "nonce", nonce);
                }
                redirectUrl = appendQueryParam(redirectUrl, "errorOAuth", error.getErrorCode());
                getRedirectStrategy().sendRedirect(request, response, redirectUrl);
                return;
            }
            getRedirectStrategy()
                    .sendRedirect(request, response, "/login?errorOAuth=" + error.getErrorCode());
        } else if (exception instanceof ProviderNotFoundException) {
            if (TauriSamlUtils.isTauriRelayState(request)) {
                String redirectUrl =
                        TauriOAuthUtils.defaultTauriCallbackPath(request.getContextPath());
                String nonce = TauriSamlUtils.extractNonceFromRequest(request);
                if (nonce != null) {
                    redirectUrl = appendQueryParam(redirectUrl, "nonce", nonce);
                }
                redirectUrl =
                        appendQueryParam(
                                redirectUrl, "errorOAuth", "not_authentication_provider_found");
                getRedirectStrategy().sendRedirect(request, response, redirectUrl);
                return;
            }
            getRedirectStrategy()
                    .sendRedirect(
                            request,
                            response,
                            "/login?errorOAuth=not_authentication_provider_found");
        }
    }

    private String appendQueryParam(String path, String key, String value) {
        if (path == null || path.isBlank()) {
            return path;
        }
        String separator = path.contains("?") ? "&" : "?";
        String encodedKey =
                java.net.URLEncoder.encode(key, java.nio.charset.StandardCharsets.UTF_8);
        String encodedValue =
                value == null
                        ? ""
                        : java.net.URLEncoder.encode(
                                value, java.nio.charset.StandardCharsets.UTF_8);
        return path + separator + encodedKey + "=" + encodedValue;
    }
}
