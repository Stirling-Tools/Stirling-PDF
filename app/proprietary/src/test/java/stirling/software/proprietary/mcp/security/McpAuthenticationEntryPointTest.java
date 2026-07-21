package stirling.software.proprietary.mcp.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** The resource_metadata URL must reflect the public host behind a reverse proxy. */
class McpAuthenticationEntryPointTest {

    private static final String META = "/.well-known/oauth-protected-resource";
    private final McpAuthenticationEntryPoint entryPoint = new McpAuthenticationEntryPoint(META);

    @Test
    void usesForwardedHeadersForMetadataUrl() throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getScheme()).thenReturn("http");
        when(req.getServerName()).thenReturn("internal-host");
        when(req.getServerPort()).thenReturn(8080);
        when(req.getHeader("X-Forwarded-Proto")).thenReturn("https");
        when(req.getHeader("X-Forwarded-Host")).thenReturn("mcp.example.com");
        when(req.getHeader("X-Forwarded-Port")).thenReturn("443");
        HttpServletResponse resp = mock(HttpServletResponse.class);

        entryPoint.commence(req, resp, null);

        ArgumentCaptor<String> header = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("WWW-Authenticate"), header.capture());
        String www = header.getValue();
        assertTrue(
                www.contains("resource_metadata=\"https://mcp.example.com" + META + "\""),
                "must use forwarded host/proto, got: " + www);
        assertFalse(www.contains("internal-host"), "internal host must not leak");
        verify(resp).sendError(anyInt(), anyString());
    }

    @Test
    void fallsBackToServletHostWithoutForwardedHeaders() throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getScheme()).thenReturn("http");
        when(req.getServerName()).thenReturn("localhost");
        when(req.getServerPort()).thenReturn(8080);
        HttpServletResponse resp = mock(HttpServletResponse.class);

        entryPoint.commence(req, resp, null);

        ArgumentCaptor<String> header = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("WWW-Authenticate"), header.capture());
        assertTrue(header.getValue().contains("http://localhost:8080" + META), header.getValue());
    }

    @Test
    void surfacesRejectionReasonWhenTokenPresented() throws Exception {
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getScheme()).thenReturn("https");
        when(req.getServerName()).thenReturn("mcp.example.com");
        when(req.getServerPort()).thenReturn(443);
        when(req.getHeader("Authorization")).thenReturn("Bearer bad.token");
        HttpServletResponse resp = mock(HttpServletResponse.class);

        OAuth2Error error =
                new OAuth2Error(
                        "invalid_token",
                        "Token audience does not include this server's resource id"
                                + " (https://mcp.example.com/mcp).",
                        null);

        entryPoint.commence(req, resp, new OAuth2AuthenticationException(error));

        ArgumentCaptor<String> header = ArgumentCaptor.forClass(String.class);
        verify(resp).setHeader(eq("WWW-Authenticate"), header.capture());
        String www = header.getValue();
        assertTrue(
                www.contains("error_description=\"invalid_token - Token audience does not include"),
                "must surface the rejection reason, got: " + www);
    }
}
