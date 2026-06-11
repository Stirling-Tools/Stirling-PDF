package stirling.software.proprietary.mcp.security;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Emits 401 + {@code WWW-Authenticate: Bearer resource_metadata="..."} (RFC 9728), preferring
 * X-Forwarded-* headers to build the public-facing metadata URL.
 */
public class McpAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final String metadataPath;

    public McpAuthenticationEntryPoint(String metadataPath) {
        this.metadataPath =
                metadataPath == null ? "/.well-known/oauth-protected-resource" : metadataPath;
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException)
            throws IOException {
        String scheme = firstForwarded(request, "X-Forwarded-Proto", request.getScheme());
        String authority = forwardedHost(request, scheme);
        String metadataUrl = scheme + "://" + authority + metadataPath;
        response.setHeader(
                "WWW-Authenticate",
                "Bearer error=\"invalid_token\", resource_metadata=\"" + metadataUrl + "\"");
        response.sendError(HttpStatus.UNAUTHORIZED.value(), "Unauthorized");
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
