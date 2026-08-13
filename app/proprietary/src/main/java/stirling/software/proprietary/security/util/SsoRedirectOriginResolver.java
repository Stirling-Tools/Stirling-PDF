package stirling.software.proprietary.security.util;

import java.net.URI;
import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Resolves the origin used for post-login SSO redirects (OAuth2 and SAML2).
 *
 * <p>Precedence:
 *
 * <ol>
 *   <li>system.frontendUrl when configured, in which case no request header is consulted
 *   <li>an X-Forwarded-* or Referer derived origin, but only when its host matches the host of the
 *       request itself
 *   <li>the request itself
 * </ol>
 */
@Slf4j
public class SsoRedirectOriginResolver {

    private SsoRedirectOriginResolver() {
        // Utility class - prevent instantiation
    }

    /**
     * Resolve the origin (scheme://host[:port]) to redirect to after a successful SSO login.
     *
     * @param request the HTTP request
     * @param applicationProperties the application properties
     * @return the resolved origin, never null
     */
    public static String resolveOrigin(
            HttpServletRequest request, ApplicationProperties applicationProperties) {
        String configuredFrontendUrl = configuredFrontendUrl(applicationProperties);
        if (configuredFrontendUrl != null) {
            return configuredFrontendUrl;
        }

        String requestHost = request.getServerName();
        return resolveForwardedOrigin(request)
                .filter(candidate -> matchesRequestHost(candidate, requestHost, "X-Forwarded-Host"))
                .or(
                        () ->
                                resolveOriginFromReferer(request)
                                        .filter(
                                                candidate ->
                                                        matchesRequestHost(
                                                                candidate, requestHost, "Referer")))
                .map(Candidate::origin)
                .orElseGet(() -> buildOriginFromRequest(request));
    }

    private static String configuredFrontendUrl(ApplicationProperties applicationProperties) {
        if (applicationProperties == null || applicationProperties.getSystem() == null) {
            return null;
        }
        String frontendUrl = applicationProperties.getSystem().getFrontendUrl();
        if (frontendUrl == null || frontendUrl.trim().isEmpty()) {
            return null;
        }
        String normalized = frontendUrl.trim();
        // a trailing slash would double up against the callback path
        return normalized.endsWith("/")
                ? normalized.substring(0, normalized.length() - 1)
                : normalized;
    }

    private static boolean matchesRequestHost(
            Candidate candidate, String requestHost, String source) {
        if (requestHost != null && requestHost.equalsIgnoreCase(candidate.host())) {
            return true;
        }
        log.warn(
                "Ignoring {}-derived SSO redirect origin '{}' because its host does not match the request host '{}'. Set system.frontendUrl to the external URL of this instance if it is behind a reverse proxy.",
                source,
                candidate.origin(),
                requestHost);
        return false;
    }

    private static Optional<Candidate> resolveForwardedOrigin(HttpServletRequest request) {
        String forwardedHostHeader = request.getHeader("X-Forwarded-Host");
        if (forwardedHostHeader == null || forwardedHostHeader.isBlank()) {
            return Optional.empty();
        }
        String host = forwardedHostHeader.split(",")[0].trim();
        if (host.isEmpty()) {
            return Optional.empty();
        }

        String forwardedProtoHeader = request.getHeader("X-Forwarded-Proto");
        String proto =
                (forwardedProtoHeader == null || forwardedProtoHeader.isBlank())
                        ? request.getScheme()
                        : forwardedProtoHeader.split(",")[0].trim();

        String hostWithoutPort = stripPort(host);
        if (!host.contains(":")) {
            String forwardedPort = request.getHeader("X-Forwarded-Port");
            if (forwardedPort != null
                    && !forwardedPort.isBlank()
                    && !isDefaultPort(proto, forwardedPort.trim())) {
                host = host + ":" + forwardedPort.trim();
            }
        }
        return Optional.of(new Candidate(proto + "://" + host, hostWithoutPort));
    }

    private static Optional<Candidate> resolveOriginFromReferer(HttpServletRequest request) {
        String referer = request.getHeader("Referer");
        if (referer == null || referer.isEmpty()) {
            return Optional.empty();
        }
        try {
            URI refererUri = URI.create(referer);
            String host = refererUri.getHost();
            if (host == null) {
                return Optional.empty();
            }
            String origin = refererUri.getScheme() + "://" + host;
            int port = refererUri.getPort();
            if (port != -1 && port != 80 && port != 443) {
                origin += ":" + port;
            }
            return Optional.of(new Candidate(origin, host));
        } catch (IllegalArgumentException e) {
            log.debug("Malformed referer URL: {}, falling back to request-based origin", referer);
            return Optional.empty();
        }
    }

    private static String buildOriginFromRequest(HttpServletRequest request) {
        String scheme = request.getScheme();
        String serverName = request.getServerName();
        int serverPort = request.getServerPort();

        StringBuilder origin = new StringBuilder();
        origin.append(scheme).append("://").append(serverName);

        if ((!"http".equalsIgnoreCase(scheme) || serverPort != 80)
                && (!"https".equalsIgnoreCase(scheme) || serverPort != 443)) {
            origin.append(":").append(serverPort);
        }

        return origin.toString();
    }

    private static String stripPort(String hostAndPort) {
        if (hostAndPort.startsWith("[")) {
            int bracketEnd = hostAndPort.indexOf(']');
            return bracketEnd > 0 ? hostAndPort.substring(0, bracketEnd + 1) : hostAndPort;
        }
        int colon = hostAndPort.indexOf(':');
        return colon > 0 ? hostAndPort.substring(0, colon) : hostAndPort;
    }

    private static boolean isDefaultPort(String scheme, String port) {
        if (port == null) {
            return true;
        }
        try {
            int parsedPort = Integer.parseInt(port);
            return ("http".equalsIgnoreCase(scheme) && parsedPort == 80)
                    || ("https".equalsIgnoreCase(scheme) && parsedPort == 443);
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private record Candidate(String origin, String host) {}
}
