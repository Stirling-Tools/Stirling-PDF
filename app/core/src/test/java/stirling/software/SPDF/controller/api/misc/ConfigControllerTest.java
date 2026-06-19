package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.net.HostAndPort;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.EndpointConfiguration.DisableReason;
import stirling.software.SPDF.config.EndpointConfiguration.EndpointAvailability;
import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.System;
import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.service.UserServiceInterface;

@ExtendWith(MockitoExtension.class)
class ConfigControllerTest {

    private static final int OK_STATUS = Response.Status.OK.getStatusCode();

    @Mock private ApplicationProperties applicationProperties;
    @Mock private EndpointConfiguration endpointConfiguration;

    @Mock private Instance<ServerCertificateServiceInterface> serverCertificateService;
    @Mock private Instance<UserServiceInterface> userService;
    @Mock private Instance<LicenseServiceInterface> licenseService;

    private ConfigController configController;

    @BeforeEach
    void setUp() {
        // Optional CDI beans are now injected as jakarta.enterprise.inject.Instance<T>; the
        // controller only resolves them lazily via isResolvable()/get(). Default the optional
        // services to unresolvable so the endpoint-availability tests (which do not touch them)
        // stay isolated.
        lenient().when(serverCertificateService.isResolvable()).thenReturn(false);
        lenient().when(userService.isResolvable()).thenReturn(false);
        lenient().when(licenseService.isResolvable()).thenReturn(false);
        configController =
                new ConfigController(
                        applicationProperties,
                        endpointConfiguration,
                        serverCertificateService,
                        userService,
                        licenseService,
                        mock(stirling.software.SPDF.config.ExternalAppDepConfig.class));
    }

    @SuppressWarnings("unchecked")
    private static <T> T entity(Response response) {
        return (T) response.getEntity();
    }

    @Test
    void isEndpointEnabled_returnsTrue() {
        when(endpointConfiguration.isEndpointEnabled("flatten")).thenReturn(true);

        Response response = configController.isEndpointEnabled("flatten");

        assertEquals(OK_STATUS, response.getStatus());
        assertTrue((Boolean) entity(response));
    }

    @Test
    void isEndpointEnabled_returnsFalse() {
        when(endpointConfiguration.isEndpointEnabled("disabled-endpoint")).thenReturn(false);

        Response response = configController.isEndpointEnabled("disabled-endpoint");

        assertEquals(OK_STATUS, response.getStatus());
        assertFalse((Boolean) entity(response));
    }

    @Test
    void areEndpointsEnabled_multipleEndpoints() {
        when(endpointConfiguration.isEndpointEnabled("flatten")).thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled("compress")).thenReturn(false);

        Response response = configController.areEndpointsEnabled("flatten,compress");

        assertEquals(OK_STATUS, response.getStatus());
        Map<String, Boolean> body = entity(response);
        assertNotNull(body);
        assertEquals(2, body.size());
        assertTrue(body.get("flatten"));
        assertFalse(body.get("compress"));
    }

    @Test
    void areEndpointsEnabled_singleEndpoint() {
        when(endpointConfiguration.isEndpointEnabled("ocr")).thenReturn(true);

        Response response = configController.areEndpointsEnabled("ocr");

        assertEquals(OK_STATUS, response.getStatus());
        Map<String, Boolean> body = entity(response);
        assertNotNull(body);
        assertTrue(body.get("ocr"));
    }

    @Test
    void isGroupEnabled_returnsTrue() {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

        Response response = configController.isGroupEnabled("Ghostscript");

        assertEquals(OK_STATUS, response.getStatus());
        assertTrue((Boolean) entity(response));
    }

    @Test
    void isGroupEnabled_returnsFalse() {
        when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);

        Response response = configController.isGroupEnabled("OCRmyPDF");

        assertEquals(OK_STATUS, response.getStatus());
        assertFalse((Boolean) entity(response));
    }

    @Test
    void getEndpointAvailability_withSpecificEndpoints() {
        EndpointAvailability available = new EndpointAvailability(true, DisableReason.UNKNOWN);
        EndpointAvailability unavailable = new EndpointAvailability(false, DisableReason.UNKNOWN);

        when(endpointConfiguration.getEndpointAvailability("flatten")).thenReturn(available);
        when(endpointConfiguration.getEndpointAvailability("ocr")).thenReturn(unavailable);

        Response response =
                configController.getEndpointAvailability(java.util.List.of("flatten", "ocr"));

        assertEquals(OK_STATUS, response.getStatus());
        Map<String, EndpointAvailability> body = entity(response);
        assertNotNull(body);
        assertEquals(2, body.size());
    }

    @Test
    void getEndpointAvailability_withNullEndpoints_usesAllEndpoints() {
        when(endpointConfiguration.getAllEndpoints()).thenReturn(Set.of("flatten"));
        EndpointAvailability available = new EndpointAvailability(true, DisableReason.UNKNOWN);
        when(endpointConfiguration.getEndpointAvailability("flatten")).thenReturn(available);

        Response response = configController.getEndpointAvailability(null);

        assertEquals(OK_STATUS, response.getStatus());
        assertNotNull(entity(response));
        verify(endpointConfiguration).getAllEndpoints();
    }

    @Test
    void areEndpointsEnabled_trimSpacesFromEndpoints() {
        when(endpointConfiguration.isEndpointEnabled("flatten")).thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled("compress")).thenReturn(true);

        Response response = configController.areEndpointsEnabled("flatten, compress");

        assertEquals(OK_STATUS, response.getStatus());
        Map<String, Boolean> body = entity(response);
        assertNotNull(body);
        assertTrue(body.containsKey("flatten"));
        assertTrue(body.containsKey("compress"));
    }

    @Test
    void getEndpointAvailability_withEmptyList_usesAllEndpoints() {
        when(endpointConfiguration.getAllEndpoints()).thenReturn(Set.of("flatten"));
        EndpointAvailability available = new EndpointAvailability(true, DisableReason.UNKNOWN);
        when(endpointConfiguration.getEndpointAvailability("flatten")).thenReturn(available);

        Response response = configController.getEndpointAvailability(java.util.List.of());

        assertEquals(OK_STATUS, response.getStatus());
        verify(endpointConfiguration).getAllEndpoints();
    }

    @Test
    void resolveFrontendUrl_prefersExplicitConfiguredValue() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn("https://pdf.example.com");

        // Request would say something else, but configured wins.
        HttpServerRequest req = mock(HttpServerRequest.class);
        AppConfig appConfig = mock(AppConfig.class);

        assertEquals(
                "https://pdf.example.com", configController.resolveFrontendUrl(req, appConfig));
    }

    @Test
    void resolveFrontendUrl_usesRequestHostWhenNotConfigured() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn(null);

        HttpServerRequest req = mock(HttpServerRequest.class);
        when(req.authority()).thenReturn(HostAndPort.create("192.168.1.100", 8080));
        when(req.scheme()).thenReturn("http");

        assertEquals(
                "http://192.168.1.100:8080",
                configController.resolveFrontendUrl(req, mock(AppConfig.class)));
    }

    @Test
    void resolveFrontendUrl_elidesDefaultHttpsPort() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn("");

        HttpServerRequest req = mock(HttpServerRequest.class);
        when(req.authority()).thenReturn(HostAndPort.create("pdf.example.com", 443));
        when(req.scheme()).thenReturn("https");

        assertEquals(
                "https://pdf.example.com",
                configController.resolveFrontendUrl(req, mock(AppConfig.class)));
    }

    @Test
    void resolveFrontendUrl_fallsThroughOnLoopbackHost() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn(null);

        HttpServerRequest req = mock(HttpServerRequest.class);
        when(req.authority()).thenReturn(HostAndPort.create("localhost", 8080));

        AppConfig appConfig = mock(AppConfig.class);
        when(appConfig.getBackendUrl()).thenReturn("http://localhost:8080");
        when(appConfig.getServerPort()).thenReturn("8080");

        // Detected IP (if any) wins over loopback request host. We can't assert the
        // exact value (depends on the host running the test) but we can assert it
        // never returns "localhost".
        String result = configController.resolveFrontendUrl(req, appConfig);
        assertNotNull(result);
        assertFalse(result.contains("localhost"));
    }

    @Test
    void resolveFrontendUrl_usesEffectivePortWhenServerPortIsEphemeral() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn(null);

        // Loopback host forces the detected-LAN-IP branch, which is where an
        // ephemeral server.port=0 would otherwise leak through as ":0".
        HttpServerRequest req = mock(HttpServerRequest.class);
        when(req.authority()).thenReturn(HostAndPort.create("localhost", 8080));

        AppConfig appConfig = mock(AppConfig.class);
        when(appConfig.getBackendUrl()).thenReturn("http://localhost");
        when(appConfig.getServerPort()).thenReturn("0");

        // With server.port=0 and no quarkus.http.port set in the test JVM,
        // resolveEffectiveServerPort
        // falls back to the conventional default 8080 rather than leaking an unreachable ":0".
        String result = configController.resolveFrontendUrl(req, appConfig);
        assertNotNull(result);
        assertTrue(result.endsWith(":8080"));
        assertFalse(result.contains(":0"));
    }

    @Test
    void resolveEffectiveServerPort_fallsBackToDefaultWhenConfiguredZero() {
        AppConfig appConfig = mock(AppConfig.class);
        when(appConfig.getServerPort()).thenReturn("0");

        // server.port=0 means "ephemeral"; with no quarkus.http.port bound in the test JVM the
        // method advertises the conventional default 8080 instead of an unreachable ":0".
        assertEquals("8080", configController.resolveEffectiveServerPort(appConfig));
    }

    @Test
    void resolveEffectiveServerPort_keepsConfiguredNonZeroPort() {
        AppConfig appConfig = mock(AppConfig.class);
        when(appConfig.getServerPort()).thenReturn("8080");

        // Non-zero configured port is authoritative; the runtime env is never consulted.
        assertEquals("8080", configController.resolveEffectiveServerPort(appConfig));
    }
}
