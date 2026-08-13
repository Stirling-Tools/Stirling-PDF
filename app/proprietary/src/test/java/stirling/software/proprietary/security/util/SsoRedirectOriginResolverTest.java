package stirling.software.proprietary.security.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.common.model.ApplicationProperties;

class SsoRedirectOriginResolverTest {

    private ApplicationProperties applicationProperties;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        request = new MockHttpServletRequest();
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8080);
    }

    @Test
    void configuredFrontendUrlWinsOverHeaders() {
        applicationProperties.getSystem().setFrontendUrl("https://app.example.com");
        request.addHeader("X-Forwarded-Host", "evil.example");
        request.addHeader("Referer", "https://evil.example/callback");

        assertEquals(
                "https://app.example.com",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void configuredFrontendUrlIsTrimmedAndTrailingSlashRemoved() {
        applicationProperties.getSystem().setFrontendUrl("  https://app.example.com/  ");

        assertEquals(
                "https://app.example.com",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void forwardedHostFromAnotherHostIsRejected() {
        request.addHeader("X-Forwarded-Host", "evil.example");
        request.addHeader("X-Forwarded-Proto", "https");

        assertEquals(
                "http://localhost:8080",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void forwardedHostMatchingRequestHostIsAccepted() {
        request.addHeader("X-Forwarded-Host", "localhost");
        request.addHeader("X-Forwarded-Proto", "https");
        request.addHeader("X-Forwarded-Port", "8443");

        assertEquals(
                "https://localhost:8443",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void forwardedHostMatchingRequestHostIgnoresDefaultPort() {
        request.addHeader("X-Forwarded-Host", "LOCALHOST");
        request.addHeader("X-Forwarded-Proto", "https");
        request.addHeader("X-Forwarded-Port", "443");

        assertEquals(
                "https://LOCALHOST",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void forwardedHostWithPortMatchingRequestHostIsAccepted() {
        request.addHeader("X-Forwarded-Host", "localhost:9000");

        assertEquals(
                "http://localhost:9000",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void refererFromAnotherHostIsRejected() {
        request.addHeader("Referer", "https://evil.example/auth/callback");

        assertEquals(
                "http://localhost:8080",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void refererFromRequestHostIsAccepted() {
        request.addHeader("Referer", "https://localhost:8443/login");

        assertEquals(
                "https://localhost:8443",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void refererIsConsideredWhenForwardedHostIsRejected() {
        request.addHeader("X-Forwarded-Host", "evil.example");
        request.addHeader("Referer", "http://localhost:8080/login");

        assertEquals(
                "http://localhost:8080",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void malformedRefererFallsBackToRequestOrigin() {
        request.addHeader("Referer", "ht!tp://[not a url");

        assertEquals(
                "http://localhost:8080",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }

    @Test
    void requestOriginOmitsDefaultPort() {
        request.setScheme("https");
        request.setServerName("app.example.com");
        request.setServerPort(443);

        assertEquals(
                "https://app.example.com",
                SsoRedirectOriginResolver.resolveOrigin(request, applicationProperties));
    }
}
