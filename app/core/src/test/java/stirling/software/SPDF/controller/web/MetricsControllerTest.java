package stirling.software.SPDF.controller.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.search.Search;

import stirling.software.SPDF.config.EndpointInspector;
import stirling.software.SPDF.config.StartupApplicationListener;
import stirling.software.SPDF.service.WeeklyActiveUsersService;
import stirling.software.common.model.ApplicationProperties;

class MetricsControllerTest {

    private ApplicationProperties applicationProperties;
    private ApplicationProperties.Metrics metrics;
    private MeterRegistry meterRegistry;
    private EndpointInspector endpointInspector;
    private MetricsController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = mock(ApplicationProperties.class);
        metrics = mock(ApplicationProperties.Metrics.class);
        meterRegistry = mock(MeterRegistry.class);
        endpointInspector = mock(EndpointInspector.class);

        when(applicationProperties.getMetrics()).thenReturn(metrics);
    }

    private MetricsController createController(Optional<WeeklyActiveUsersService> wauService) {
        MetricsController ctrl =
                new MetricsController(
                        applicationProperties, meterRegistry, endpointInspector, wauService);
        ctrl.init();
        return ctrl;
    }

    // --- /status and /health ---

    @Test
    void getStatus_returnsUpAndVersion() {
        when(metrics.isEnabled()).thenReturn(false);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getStatus();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertNotNull(body);
        assertEquals("UP", body.get("status"));
        // version key should exist (may be null in test env)
        assertTrue(body.containsKey("version"));
    }

    @Test
    void getHealth_returnsUpAndVersion() {
        when(metrics.isEnabled()).thenReturn(false);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getHealth();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertNotNull(body);
        assertEquals("UP", body.get("status"));
    }

    // --- metrics disabled returns FORBIDDEN ---

    @Test
    void getPageLoads_metricsDisabled_returnsForbidden() {
        when(metrics.isEnabled()).thenReturn(false);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getPageLoads(Optional.empty());

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertEquals("This endpoint is disabled.", response.getBody());
    }

    @Test
    void getTotalRequests_metricsDisabled_returnsForbidden() {
        when(metrics.isEnabled()).thenReturn(false);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getTotalRequests(Optional.empty());

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void getUptime_metricsDisabled_returnsForbidden() {
        when(metrics.isEnabled()).thenReturn(false);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getUptime();

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void getUniquePageLoads_metricsDisabled_returnsForbidden() {
        when(metrics.isEnabled()).thenReturn(false);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getUniquePageLoads(Optional.empty());

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void getAllEndpointLoads_metricsDisabled_returnsForbidden() {
        when(metrics.isEnabled()).thenReturn(false);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getAllEndpointLoads();

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void getAllUniqueEndpointLoads_metricsDisabled_returnsForbidden() {
        when(metrics.isEnabled()).thenReturn(false);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getAllUniqueEndpointLoads();

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    // --- metrics enabled, load endpoints ---

    @Test
    void getPageLoads_metricsEnabled_returnsCount() {
        when(metrics.isEnabled()).thenReturn(true);
        controller = createController(Optional.empty());

        Search search = mock(Search.class);
        Search taggedSearch = mock(Search.class);
        when(meterRegistry.find("http.requests")).thenReturn(search);
        when(search.tag("method", "GET")).thenReturn(taggedSearch);

        Counter counter = mockCounter("/some-page", "GET", null, 5.0);
        when(taggedSearch.counters()).thenReturn(List.of(counter));
        when(endpointInspector.getValidGetEndpoints()).thenReturn(Collections.emptySet());

        ResponseEntity<?> response = controller.getPageLoads(Optional.empty());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(5.0, response.getBody());
    }

    @Test
    void getPageLoads_withSpecificEndpoint_filtersCorrectly() {
        when(metrics.isEnabled()).thenReturn(true);
        controller = createController(Optional.empty());

        Search search = mock(Search.class);
        Search taggedSearch = mock(Search.class);
        when(meterRegistry.find("http.requests")).thenReturn(search);
        when(search.tag("method", "GET")).thenReturn(taggedSearch);

        Counter counter1 = mockCounter("/page-a", "GET", null, 3.0);
        Counter counter2 = mockCounter("/page-b", "GET", null, 7.0);
        when(taggedSearch.counters()).thenReturn(List.of(counter1, counter2));
        when(endpointInspector.getValidGetEndpoints()).thenReturn(Collections.emptySet());

        ResponseEntity<?> response = controller.getPageLoads(Optional.of("/page-a"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(3.0, response.getBody());
    }

    @Test
    void getTotalRequests_metricsEnabled_returnsPostCount() {
        when(metrics.isEnabled()).thenReturn(true);
        controller = createController(Optional.empty());

        Search search = mock(Search.class);
        Search taggedSearch = mock(Search.class);
        when(meterRegistry.find("http.requests")).thenReturn(search);
        when(search.tag("method", "POST")).thenReturn(taggedSearch);

        Counter counter = mockCounter("/api/v1/convert", "POST", null, 10.0);
        when(taggedSearch.counters()).thenReturn(List.of(counter));

        ResponseEntity<?> response = controller.getTotalRequests(Optional.empty());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(10.0, response.getBody());
    }

    @Test
    void getTotalRequests_postWithoutApiV1_isFiltered() {
        when(metrics.isEnabled()).thenReturn(true);
        controller = createController(Optional.empty());

        Search search = mock(Search.class);
        Search taggedSearch = mock(Search.class);
        when(meterRegistry.find("http.requests")).thenReturn(search);
        when(search.tag("method", "POST")).thenReturn(taggedSearch);

        Counter counter = mockCounter("/some-non-api", "POST", null, 10.0);
        when(taggedSearch.counters()).thenReturn(List.of(counter));

        ResponseEntity<?> response = controller.getTotalRequests(Optional.empty());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(0.0, response.getBody());
    }

    @Test
    void getPageLoads_txtEndpoint_isFiltered() {
        when(metrics.isEnabled()).thenReturn(true);
        controller = createController(Optional.empty());

        Search search = mock(Search.class);
        Search taggedSearch = mock(Search.class);
        when(meterRegistry.find("http.requests")).thenReturn(search);
        when(search.tag("method", "GET")).thenReturn(taggedSearch);

        Counter counter = mockCounter("/robots.txt", "GET", null, 3.0);
        when(taggedSearch.counters()).thenReturn(List.of(counter));
        when(endpointInspector.getValidGetEndpoints()).thenReturn(Collections.emptySet());

        ResponseEntity<?> response = controller.getPageLoads(Optional.empty());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(0.0, response.getBody());
    }

    // --- uptime ---

    @Test
    void getUptime_metricsEnabled_returnsFormattedDuration() {
        when(metrics.isEnabled()).thenReturn(true);
        controller = createController(Optional.empty());

        StartupApplicationListener.startTime = LocalDateTime.now().minusHours(2).minusMinutes(30);

        ResponseEntity<?> response = controller.getUptime();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        String body = (String) response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("0d 2h 30m"));
    }

    // --- WAU ---

    @Test
    void getWeeklyActiveUsers_serviceEmpty_returnsNotFound() {
        when(metrics.isEnabled()).thenReturn(true);
        controller = createController(Optional.empty());

        ResponseEntity<?> response = controller.getWeeklyActiveUsers();

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void getWeeklyActiveUsers_servicePresent_returnsStats() {
        when(metrics.isEnabled()).thenReturn(true);
        WeeklyActiveUsersService wauService = mock(WeeklyActiveUsersService.class);
        when(wauService.getWeeklyActiveUsers()).thenReturn(42L);
        when(wauService.getTotalUniqueBrowsers()).thenReturn(100L);
        when(wauService.getDaysOnline()).thenReturn(7L);
        when(wauService.getStartTime()).thenReturn(java.time.Instant.parse("2025-01-01T00:00:00Z"));
        controller = createController(Optional.of(wauService));

        ResponseEntity<?> response = controller.getWeeklyActiveUsers();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) response.getBody();
        assertNotNull(body);
        assertEquals(42L, body.get("weeklyActiveUsers"));
        assertEquals(100L, body.get("totalUniqueBrowsers"));
        assertEquals(7L, body.get("daysOnline"));
    }

    @Test
    void getWeeklyActiveUsers_metricsDisabled_returnsForbidden() {
        when(metrics.isEnabled()).thenReturn(false);
        WeeklyActiveUsersService wauService = mock(WeeklyActiveUsersService.class);
        controller = createController(Optional.of(wauService));

        ResponseEntity<?> response = controller.getWeeklyActiveUsers();

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    // --- EndpointCount ---

    @Test
    void endpointCount_gettersAndSetters() {
        MetricsController.EndpointCount ec = new MetricsController.EndpointCount("/test", 5.0);
        assertEquals("/test", ec.getEndpoint());
        assertEquals(5.0, ec.getCount());

        ec.setEndpoint("/other");
        ec.setCount(10.0);
        assertEquals("/other", ec.getEndpoint());
        assertEquals(10.0, ec.getCount());
    }

    // --- helpers ---

    private Counter mockCounter(String uri, String method, String session, double count) {
        Counter counter = mock(Counter.class);
        Meter.Id id = mock(Meter.Id.class);
        when(counter.getId()).thenReturn(id);
        when(id.getTag("uri")).thenReturn(uri);
        when(id.getTag("method")).thenReturn(method);
        when(id.getTag("session")).thenReturn(session);
        when(counter.count()).thenReturn(count);
        return counter;
    }
}
