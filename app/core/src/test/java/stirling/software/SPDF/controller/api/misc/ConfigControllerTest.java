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

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.EndpointConfiguration.DisableReason;
import stirling.software.SPDF.config.EndpointConfiguration.EndpointAvailability;
import stirling.software.common.model.ApplicationProperties;
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
}
