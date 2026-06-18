package stirling.software.proprietary.mcp.security;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.web.AuthenticationEntryPoint;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Emits 401 + {@code WWW-Authenticate: Bearer resource_metadata="..."} (RFC 9728) from
 * X-Forwarded-* headers. A rejected token also logs the OAuth2 reason and echoes it as {@code
 * error_description}.
 */
@Slf4j
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
        // Tokenless 401 is the normal discovery handshake; only a rejected token is a real failure.
        boolean tokenPresented = request.getHeader("Authorization") != null;
        String reason = rejectionReason(authException);
        if (tokenPresented) {
            log.warn("MCP rejected bearer token: {}", reason != null ? reason : "invalid_token");
        } else {
            log.debug("MCP 401: no bearer token; returning protected-resource metadata pointer");
        }

        String scheme = firstForwarded(request, "X-Forwarded-Proto", request.getScheme());
        String authority = forwardedHost(request, scheme);
        String metadataUrl = scheme + "://" + authority + metadataPath;

        StringBuilder header = new StringBuilder("Bearer error=\"invalid_token\"");
        if (tokenPresented && reason != null) {
            header.append(", error_description=\"").append(reason).append('"');
        }
        header.append(", resource_metadata=\"").append(metadataUrl).append('"');
        response.setHeader("WWW-Authenticate", header.toString());
        response.sendError(HttpStatus.UNAUTHORIZED.value(), "Unauthorized");
    }

    /**
     * OAuth2 error as {@code "code - description"}, sanitized for a header/log line; null if none.
     */
    private static String rejectionReason(AuthenticationException ex) {
        if (!(ex instanceof OAuth2AuthenticationException oae)) {
            return null;
        }
        OAuth2Error error = oae.getError();
        if (error == null) {
            return null;
        }
        String description = error.getDescription();
        String combined =
                (description == null || description.isBlank())
                        ? error.getErrorCode()
                        : error.getErrorCode() + " - " + description;
        return combined == null ? null : combined.replaceAll("[\\r\\n\"]", " ").trim();
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
