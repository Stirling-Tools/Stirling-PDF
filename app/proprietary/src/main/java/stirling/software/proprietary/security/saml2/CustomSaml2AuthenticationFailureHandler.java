package stirling.software.proprietary.security.saml2;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.oauth2.TauriOAuthUtils;

// TODO: Migration required - This was a Spring Security SimpleUrlAuthenticationFailureHandler
// (@ConditionalOnProperty "security.saml2.enabled"). There is NO Quarkus SAML extension, so the
// SAML SP must be rehosted on a Jakarta @WebServlet using OpenSAML 5 (dnulnets/quarkus-saml
// pattern). When that servlet is in place, wire it to invoke onAuthenticationFailure(...) below
// on SAML authentication failures. The Spring security glue removed:
//   - extends SimpleUrlAuthenticationFailureHandler / getRedirectStrategy().sendRedirect(...)
//     -> replaced by HttpServletResponse.sendRedirect(...)
//   - org.springframework.security.core.AuthenticationException
//     -> replaced by a generic Exception parameter
//   - org.springframework.security.saml2.{Saml2Error, Saml2AuthenticationException}
//     -> re-derive the SAML error code from the OpenSAML 5 failure handling in the new servlet
//   - org.springframework.security.authentication.ProviderNotFoundException
//     -> map to the "not_authentication_provider_found" branch from the new servlet
// TODO: Migration required - the @ConditionalOnProperty(name = "security.saml2.enabled",
// havingValue = "true") build-time toggle was removed; this is a runtime property, so guard
// invocation at the call site (the SAML servlet) or via a runtime config check rather than a
// CDI/build-profile condition.
@Slf4j
@ApplicationScoped
public class CustomSaml2AuthenticationFailureHandler {

    @Audited(type = AuditEventType.USER_FAILED_LOGIN, level = AuditLevel.BASIC)
    public void onAuthenticationFailure(
            HttpServletRequest request, HttpServletResponse response, Exception exception)
            throws IOException {
        log.error("Authentication error", exception);

        // TODO: Migration required - the original branched on Spring's
        // Saml2AuthenticationException (extracting Saml2Error.getErrorCode()) vs
        // ProviderNotFoundException. With OpenSAML 5 on a Jakarta servlet, derive the SAML
        // error code and the "no provider found" condition from the new failure-handling code
        // and call the corresponding branch below.
        String samlErrorCode = resolveSamlErrorCode(exception);
        if (samlErrorCode != null) {
            if (TauriSamlUtils.isTauriRelayState(request)) {
                String redirectUrl =
                        TauriOAuthUtils.defaultTauriCallbackPath(request.getContextPath());
                String nonce = TauriSamlUtils.extractNonceFromRequest(request);
                if (nonce != null) {
                    redirectUrl = appendQueryParam(redirectUrl, "nonce", nonce);
                }
                redirectUrl = appendQueryParam(redirectUrl, "errorOAuth", samlErrorCode);
                response.sendRedirect(redirectUrl);
                return;
            }
            response.sendRedirect("/login?errorOAuth=" + samlErrorCode);
        } else if (isProviderNotFound(exception)) {
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
                response.sendRedirect(redirectUrl);
                return;
            }
            response.sendRedirect("/login?errorOAuth=not_authentication_provider_found");
        }
    }

    // TODO: Migration required - return the SAML error code when the failure originates from an
    // OpenSAML 5 SAML response error, otherwise null. Previously this came from
    // Saml2AuthenticationException.getSaml2Error().getErrorCode().
    private String resolveSamlErrorCode(Exception exception) {
        return null;
    }

    // TODO: Migration required - return true when no authentication provider was found.
    // Previously this was (exception instanceof ProviderNotFoundException).
    private boolean isProviderNotFound(Exception exception) {
        return false;
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
