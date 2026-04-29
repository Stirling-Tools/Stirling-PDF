package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.SPDF.config.EndpointInspector;
import stirling.software.common.service.PostHogService;

class MetricsAggregatorServiceExtendedTest {

    private SimpleMeterRegistry meterRegistry;
    private PostHogService postHogService;
    private EndpointInspector endpointInspector;
    private MetricsAggregatorService service;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        postHogService = mock(PostHogService.class);
        endpointInspector = mock(EndpointInspector.class);
        when(endpointInspector.getValidGetEndpoints())
                .thenReturn(Set.of("/home", "/about", "/settings"));
        when(endpointInspector.isValidGetEndpoint("/home")).thenReturn(true);
        when(endpointInspector.isValidGetEndpoint("/about")).thenReturn(true);
        when(endpointInspector.isValidGetEndpoint("/settings")).thenReturn(true);
        service = new MetricsAggregatorService(meterRegistry, postHogService, endpointInspector);
    }

    @Test
    void aggregateAndSendMetrics_noMetrics_doesNotSendEvent() {
        service.aggregateAndSendMetrics();
        verify(postHogService, never()).captureEvent(anyString(), anyMap());
    }

    @Test
    void aggregateAndSendMetrics_skipsShortUris() {
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/").increment(5);
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/a").increment(3);

        service.aggregateAndSendMetrics();
        verify(postHogService, never()).captureEvent(anyString(), anyMap());
    }

    @Test
    void aggregateAndSendMetrics_skipsNonGetNonPostMethods() {
        meterRegistry
                .counter("http.requests", "method", "PUT", "uri", "/api/v1/update")
                .increment(5);
        meterRegistry
                .counter("http.requests", "method", "DELETE", "uri", "/api/v1/delete")
                .increment(3);

        service.aggregateAndSendMetrics();
        verify(postHogService, never()).captureEvent(anyString(), anyMap());
    }

    @Test
    void aggregateAndSendMetrics_skipsPostWithoutApiV1() {
        meterRegistry.counter("http.requests", "method", "POST", "uri", "/login").increment(5);

        service.aggregateAndSendMetrics();
        verify(postHogService, never()).captureEvent(anyString(), anyMap());
    }

    @Test
    void aggregateAndSendMetrics_includesPostWithApiV1() {
        meterRegistry
                .counter("http.requests", "method", "POST", "uri", "/api/v1/convert")
                .increment(2);

        service.aggregateAndSendMetrics();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHogService).captureEvent(eq("aggregated_metrics"), captor.capture());
        Map<String, Object> metrics = captor.getValue();
        assertEquals(1, metrics.size());
        assertEquals(2.0, (Double) metrics.get("http_requests_POST__api_v1_convert"));
    }

    @Test
    void aggregateAndSendMetrics_skipsInvalidGetEndpoints() {
        when(endpointInspector.isValidGetEndpoint("/invalid")).thenReturn(false);
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/invalid").increment(5);

        service.aggregateAndSendMetrics();
        verify(postHogService, never()).captureEvent(anyString(), anyMap());
    }

    @Test
    void aggregateAndSendMetrics_includesValidGetEndpoints() {
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/home").increment(3);

        service.aggregateAndSendMetrics();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHogService).captureEvent(eq("aggregated_metrics"), captor.capture());
        Map<String, Object> metrics = captor.getValue();
        assertEquals(3.0, (Double) metrics.get("http_requests_GET__home"));
    }

    @Test
    void aggregateAndSendMetrics_skipsTxtUris() {
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/robots.txt").increment(10);

        service.aggregateAndSendMetrics();
        verify(postHogService, never()).captureEvent(anyString(), anyMap());
    }

    @Test
    void aggregateAndSendMetrics_onlyDifferencesOnSecondCall() {
        Counter counter = meterRegistry.counter("http.requests", "method", "GET", "uri", "/home");
        counter.increment(10);
        service.aggregateAndSendMetrics();
        reset(postHogService);

        // No new increments - should not send
        service.aggregateAndSendMetrics();
        verify(postHogService, never()).captureEvent(anyString(), anyMap());
    }

    @Test
    void aggregateAndSendMetrics_multipleCountersMixed() {
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/home").increment(5);
        meterRegistry
                .counter("http.requests", "method", "POST", "uri", "/api/v1/merge")
                .increment(3);
        meterRegistry
                .counter("http.requests", "method", "PUT", "uri", "/api/v1/x")
                .increment(1); // skipped
        meterRegistry
                .counter("http.requests", "method", "GET", "uri", "/robots.txt")
                .increment(2); // skipped

        service.aggregateAndSendMetrics();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHogService).captureEvent(eq("aggregated_metrics"), captor.capture());
        Map<String, Object> metrics = captor.getValue();
        assertEquals(2, metrics.size());
        assertEquals(5.0, (Double) metrics.get("http_requests_GET__home"));
        assertEquals(3.0, (Double) metrics.get("http_requests_POST__api_v1_merge"));
    }

    @Test
    void aggregateAndSendMetrics_emptyEndpointInspector_skipsGetValidation() {
        // When endpoint inspector has empty valid endpoints, GET validation is skipped
        EndpointInspector emptyInspector = mock(EndpointInspector.class);
        when(emptyInspector.getValidGetEndpoints()).thenReturn(Set.of());
        MetricsAggregatorService serviceNoValidation =
                new MetricsAggregatorService(meterRegistry, postHogService, emptyInspector);

        meterRegistry
                .counter("http.requests", "method", "GET", "uri", "/any-endpoint")
                .increment(7);

        serviceNoValidation.aggregateAndSendMetrics();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHogService).captureEvent(eq("aggregated_metrics"), captor.capture());
        Map<String, Object> metrics = captor.getValue();
        assertEquals(7.0, (Double) metrics.get("http_requests_GET__any-endpoint"));
    }

    @Test
    void aggregateAndSendMetrics_keyFormat_replacesSlashesWithUnderscores() {
        meterRegistry
                .counter("http.requests", "method", "POST", "uri", "/api/v1/a/b/c")
                .increment(1);

        service.aggregateAndSendMetrics();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHogService).captureEvent(eq("aggregated_metrics"), captor.capture());
        assertTrue(captor.getValue().containsKey("http_requests_POST__api_v1_a_b_c"));
    }
}
