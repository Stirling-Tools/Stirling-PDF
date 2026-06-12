package stirling.software.proprietary.mcp.security;

import java.io.IOException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.ws.rs.core.Response;

/**
 * Emits 401 + {@code WWW-Authenticate: Bearer resource_metadata="..."} (RFC 9728), preferring
 * X-Forwarded-* headers to build the public-facing metadata URL.
 *
 * <p>TODO: Migration required - this was a Spring Security {@code AuthenticationEntryPoint}
 * (commence(...) invoked by the SecurityFilterChain on authentication failure). Quarkus has no
 * SecurityFilterChain equivalent. The 401 response must instead be produced by a Quarkus auth
 * mechanism / failure handler (e.g. an {@link io.quarkus.security.AuthenticationFailedException}
 * mapper via a {@code jakarta.ws.rs.ext.ExceptionMapper}, or a custom HttpAuthenticationMechanism
 * sendChallenge). The reusable header-building logic below has been preserved; wire
 * {@link #commence(HttpServletRequest, HttpServletResponse)} into that handler.
 */
@ApplicationScoped
public class McpAuthenticationEntryPoint {

    private final String metadataPath;

    public McpAuthenticationEntryPoint() {
        this("/.well-known/oauth-protected-resource");
    }

    public McpAuthenticationEntryPoint(String metadataPath) {
        this.metadataPath =
                metadataPath == null ? "/.well-known/oauth-protected-resource" : metadataPath;
    }

    public void commence(HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        String scheme = firstForwarded(request, "X-Forwarded-Proto", request.getScheme());
        String authority = forwardedHost(request, scheme);
        String metadataUrl = scheme + "://" + authority + metadataPath;
        response.setHeader(
                "WWW-Authenticate",
                "Bearer error=\"invalid_token\", resource_metadata=\"" + metadataUrl + "\"");
        response.sendError(Response.Status.UNAUTHORIZED.getStatusCode(), "Unauthorized");
    }

    /** host[:port] from forwarded headers when present, else the servlet host/port. */
    private static String forwardedHost(HttpServletRequest request, String scheme) {
        String host = firstForwarded(request, "X-Forwarded-Host", null);
        if (host != null && !host.isBlank()) {
            // X-Forwarded-Host may already carry a port.
            if (host.contains(":")) {
                return host;
            }
            String fwdPort = firstForwarded(request, "X-Forwarded-Port", null);
            if (fwdPort != null && !isDefaultPort(scheme, fwdPort)) {
                return host + ":" + fwdPort;
            }
            return host;
        }
        String authority = request.getServerName();
        int port = request.getServerPort();
        if (port > 0 && !isDefaultPort(scheme, Integer.toString(port))) {
            authority = authority + ":" + port;
        }
        return authority;
    }

    /** First (client-most) value of a possibly comma-listed forwarded header, trimmed. */
    private static String firstForwarded(HttpServletRequest request, String name, String fallback) {
        String value = request.getHeader(name);
        if (value == null || value.isBlank()) {
            return fallback;
        }
        int comma = value.indexOf(',');
        return (comma >= 0 ? value.substring(0, comma) : value).trim();
    }

    private static boolean isDefaultPort(String scheme, String port) {
        return ("http".equals(scheme) && "80".equals(port))
                || ("https".equals(scheme) && "443".equals(port));
    }
}
