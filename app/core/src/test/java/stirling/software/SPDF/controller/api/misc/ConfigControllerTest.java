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
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.EndpointConfiguration.DisableReason;
import stirling.software.SPDF.config.EndpointConfiguration.EndpointAvailability;
import stirling.software.common.configuration.AppConfig;
import stirling.software.common.configuration.interfaces.ShowAdminInterface;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.System;
import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.service.UserServiceInterface;

@ExtendWith(MockitoExtension.class)
class ConfigControllerTest {

    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationContext applicationContext;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private ServerCertificateServiceInterface serverCertificateService;
    @Mock private UserServiceInterface userService;
    @Mock private ShowAdminInterface showAdmin;
    @Mock private LicenseServiceInterface licenseService;

    private ConfigController configController;

    @BeforeEach
    void setUp() {
        configController =
                new ConfigController(
                        applicationProperties,
                        applicationContext,
                        endpointConfiguration,
                        serverCertificateService,
                        userService,
                        showAdmin,
                        licenseService,
                        mock(stirling.software.SPDF.config.ExternalAppDepConfig.class));
    }

    @Test
    void isEndpointEnabled_returnsTrue() {
        when(endpointConfiguration.isEndpointEnabled("flatten")).thenReturn(true);

        ResponseEntity<Boolean> response = configController.isEndpointEnabled("flatten");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody());
    }

    @Test
    void isEndpointEnabled_returnsFalse() {
        when(endpointConfiguration.isEndpointEnabled("disabled-endpoint")).thenReturn(false);

        ResponseEntity<Boolean> response = configController.isEndpointEnabled("disabled-endpoint");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertFalse(response.getBody());
    }

    @Test
    void areEndpointsEnabled_multipleEndpoints() {
        when(endpointConfiguration.isEndpointEnabled("flatten")).thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled("compress")).thenReturn(false);

        ResponseEntity<Map<String, Boolean>> response =
                configController.areEndpointsEnabled("flatten,compress");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<String, Boolean> body = response.getBody();
        assertNotNull(body);
        assertEquals(2, body.size());
        assertTrue(body.get("flatten"));
        assertFalse(body.get("compress"));
    }

    @Test
    void areEndpointsEnabled_singleEndpoint() {
        when(endpointConfiguration.isEndpointEnabled("ocr")).thenReturn(true);

        ResponseEntity<Map<String, Boolean>> response = configController.areEndpointsEnabled("ocr");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().get("ocr"));
    }

    @Test
    void isGroupEnabled_returnsTrue() {
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

        ResponseEntity<Boolean> response = configController.isGroupEnabled("Ghostscript");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody());
    }

    @Test
    void isGroupEnabled_returnsFalse() {
        when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);

        ResponseEntity<Boolean> response = configController.isGroupEnabled("OCRmyPDF");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertFalse(response.getBody());
    }

    @Test
    void getEndpointAvailability_withSpecificEndpoints() {
        EndpointAvailability available = new EndpointAvailability(true, DisableReason.UNKNOWN);
        EndpointAvailability unavailable = new EndpointAvailability(false, DisableReason.UNKNOWN);

        when(endpointConfiguration.getEndpointAvailability("flatten")).thenReturn(available);
        when(endpointConfiguration.getEndpointAvailability("ocr")).thenReturn(unavailable);

        ResponseEntity<Map<String, EndpointAvailability>> response =
                configController.getEndpointAvailability(java.util.List.of("flatten", "ocr"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<String, EndpointAvailability> body = response.getBody();
        assertNotNull(body);
        assertEquals(2, body.size());
    }

    @Test
    void getEndpointAvailability_withNullEndpoints_usesAllEndpoints() {
        when(endpointConfiguration.getAllEndpoints()).thenReturn(Set.of("flatten"));
        EndpointAvailability available = new EndpointAvailability(true, DisableReason.UNKNOWN);
        when(endpointConfiguration.getEndpointAvailability("flatten")).thenReturn(available);

        ResponseEntity<Map<String, EndpointAvailability>> response =
                configController.getEndpointAvailability(null);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        verify(endpointConfiguration).getAllEndpoints();
    }

    @Test
    void areEndpointsEnabled_trimSpacesFromEndpoints() {
        when(endpointConfiguration.isEndpointEnabled("flatten")).thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled("compress")).thenReturn(true);

        ResponseEntity<Map<String, Boolean>> response =
                configController.areEndpointsEnabled("flatten, compress");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<String, Boolean> body = response.getBody();
        assertNotNull(body);
        assertTrue(body.containsKey("flatten"));
        assertTrue(body.containsKey("compress"));
    }

    @Test
    void getEndpointAvailability_withEmptyList_usesAllEndpoints() {
        when(endpointConfiguration.getAllEndpoints()).thenReturn(Set.of("flatten"));
        EndpointAvailability available = new EndpointAvailability(true, DisableReason.UNKNOWN);
        when(endpointConfiguration.getEndpointAvailability("flatten")).thenReturn(available);

        ResponseEntity<Map<String, EndpointAvailability>> response =
                configController.getEndpointAvailability(java.util.List.of());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(endpointConfiguration).getAllEndpoints();
    }

    @Test
    void resolveFrontendUrl_prefersExplicitConfiguredValue() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn("https://pdf.example.com");

        // Request would say something else, but configured wins.
        HttpServletRequest req = mock(HttpServletRequest.class);
        AppConfig appConfig = mock(AppConfig.class);

        assertEquals(
                "https://pdf.example.com", configController.resolveFrontendUrl(req, appConfig));
    }

    @Test
    void resolveFrontendUrl_usesRequestHostWhenNotConfigured() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn(null);

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getServerName()).thenReturn("192.168.1.100");
        when(req.getScheme()).thenReturn("http");
        when(req.getServerPort()).thenReturn(8080);

        assertEquals(
                "http://192.168.1.100:8080",
                configController.resolveFrontendUrl(req, mock(AppConfig.class)));
    }

    @Test
    void resolveFrontendUrl_elidesDefaultHttpsPort() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn("");

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getServerName()).thenReturn("pdf.example.com");
        when(req.getScheme()).thenReturn("https");
        when(req.getServerPort()).thenReturn(443);

        assertEquals(
                "https://pdf.example.com",
                configController.resolveFrontendUrl(req, mock(AppConfig.class)));
    }

    @Test
    void resolveFrontendUrl_fallsThroughOnLoopbackHost() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn(null);

        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getServerName()).thenReturn("localhost");

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
    void resolveFrontendUrl_usesActualPortWhenServerPortIsEphemeral() {
        System sys = mock(System.class);
        when(applicationProperties.getSystem()).thenReturn(sys);
        when(sys.getFrontendUrl()).thenReturn(null);

        // Loopback host forces the detected-LAN-IP branch, which is where an
        // ephemeral server.port=0 would otherwise leak through as ":0".
        HttpServletRequest req = mock(HttpServletRequest.class);
        when(req.getServerName()).thenReturn("localhost");

        AppConfig appConfig = mock(AppConfig.class);
        when(appConfig.getBackendUrl()).thenReturn("http://localhost");
        when(appConfig.getServerPort()).thenReturn("0");

        org.springframework.core.env.Environment environment =
                mock(org.springframework.core.env.Environment.class);
        when(applicationContext.getEnvironment()).thenReturn(environment);
        when(environment.getProperty("local.server.port")).thenReturn("54321");

        String result = configController.resolveFrontendUrl(req, appConfig);
        assertNotNull(result);
        assertTrue(result.endsWith(":54321"));
        assertFalse(result.contains(":0"));
    }

    @Test
    void resolveEffectiveServerPort_prefersActualBoundPortWhenConfiguredZero() {
        AppConfig appConfig = mock(AppConfig.class);
        when(appConfig.getServerPort()).thenReturn("0");

        org.springframework.core.env.Environment environment =
                mock(org.springframework.core.env.Environment.class);
        when(applicationContext.getEnvironment()).thenReturn(environment);
        when(environment.getProperty("local.server.port")).thenReturn("54321");

        assertEquals("54321", configController.resolveEffectiveServerPort(appConfig));
    }

    @Test
    void resolveEffectiveServerPort_keepsConfiguredNonZeroPort() {
        AppConfig appConfig = mock(AppConfig.class);
        when(appConfig.getServerPort()).thenReturn("8080");

        // Non-zero configured port is authoritative; the runtime env is never consulted.
        assertEquals("8080", configController.resolveEffectiveServerPort(appConfig));
    }
}
