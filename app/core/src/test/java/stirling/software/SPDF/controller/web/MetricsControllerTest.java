package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.SPDF.config.EndpointInspector;
import stirling.software.common.model.ApplicationProperties;

class MetricsControllerTest {

    private ApplicationProperties applicationProperties;
    private SimpleMeterRegistry meterRegistry;
    private EndpointInspector endpointInspector;
    private MetricsController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getMetrics().setEnabled(true);
        meterRegistry = new SimpleMeterRegistry();
        endpointInspector = mock(EndpointInspector.class);
        when(endpointInspector.getValidGetEndpoints()).thenReturn(Collections.emptySet());

        controller = new MetricsController(applicationProperties, meterRegistry, endpointInspector);
        controller.init();
    }

    @Test
    void getPageLoadsReturnsTotalCount() {
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/endpoint").increment(3);

        ResponseEntity<?> response = controller.getPageLoads(Optional.empty());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(3.0, response.getBody());
    }

    @Test
    void getUniquePageLoadsCountsUniqueSessions() {
        meterRegistry
                .counter(
                        "http.requests", "method", "GET", "uri", "/endpoint", "session", "session1")
                .increment();
        meterRegistry
                .counter(
                        "http.requests", "method", "GET", "uri", "/endpoint", "session", "session2")
                .increment();
        // Duplicate session should not increase unique count
        meterRegistry
                .counter(
                        "http.requests", "method", "GET", "uri", "/endpoint", "session", "session1")
                .increment();

        ResponseEntity<?> response = controller.getUniquePageLoads(Optional.empty());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(2.0, response.getBody());
    }

    @Test
    void getAllEndpointLoadsReturnsSortedCounts() {
        meterRegistry
                .counter("http.requests", "method", "GET", "uri", "/less-popular")
                .increment(1);
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/popular").increment(3);

        ResponseEntity<?> response = controller.getAllEndpointLoads();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        List<MetricsController.EndpointCount> results =
                (List<MetricsController.EndpointCount>) response.getBody();

        assertNotNull(results);
        assertEquals(2, results.size());
        assertEquals("/popular", results.get(0).getEndpoint());
        assertEquals(3.0, results.get(0).getCount());
        assertEquals("/less-popular", results.get(1).getEndpoint());
        assertEquals(1.0, results.get(1).getCount());
    }

    @Test
    void metricsDisabledReturnsForbidden() {
        ApplicationProperties disabledProperties = new ApplicationProperties();
        disabledProperties.getMetrics().setEnabled(false);
        MetricsController disabledController =
                new MetricsController(disabledProperties, meterRegistry, endpointInspector);
        disabledController.init();

        ResponseEntity<?> response = disabledController.getStatus();

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertEquals("This endpoint is disabled.", response.getBody());
    }
}
