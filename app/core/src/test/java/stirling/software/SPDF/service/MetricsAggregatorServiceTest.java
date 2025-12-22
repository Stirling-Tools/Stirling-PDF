package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.SPDF.config.EndpointInspector;
import stirling.software.common.service.PostHogService;

class MetricsAggregatorServiceTest {

    private SimpleMeterRegistry meterRegistry;
    private PostHogService postHogService;
    private EndpointInspector endpointInspector;
    private MetricsAggregatorService metricsAggregatorService;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        postHogService = mock(PostHogService.class);
        endpointInspector = mock(EndpointInspector.class);
        when(endpointInspector.getValidGetEndpoints()).thenReturn(Set.of("/getEndpoint"));
        when(endpointInspector.isValidGetEndpoint("/getEndpoint")).thenReturn(true);
        metricsAggregatorService =
                new MetricsAggregatorService(meterRegistry, postHogService, endpointInspector);
    }

    @Captor private ArgumentCaptor<Map<String, Object>> captor;

    @Test
    void testAggregateAndSendMetrics() {
        meterRegistry.counter("http.requests", "method", "GET", "uri", "/getEndpoint").increment(3);
        meterRegistry.counter("http.requests", "method", "POST", "uri", "/api/v1/do").increment(2);

        metricsAggregatorService.aggregateAndSendMetrics();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHogService).captureEvent(eq("aggregated_metrics"), captor.capture());
        Map<String, Object> metrics = captor.getValue();

        assertEquals(2, metrics.size());
        assertEquals(3.0, (Double) metrics.get("http_requests_GET__getEndpoint"));
        assertEquals(2.0, (Double) metrics.get("http_requests_POST__api_v1_do"));
    }

    @Test
    void testAggregateAndSendMetricsSendsOnlyDifferences() {
        Counter counter =
                meterRegistry.counter("http.requests", "method", "GET", "uri", "/getEndpoint");
        counter.increment(5);
        metricsAggregatorService.aggregateAndSendMetrics();
        reset(postHogService);

        counter.increment(2);
        metricsAggregatorService.aggregateAndSendMetrics();

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHogService).captureEvent(eq("aggregated_metrics"), captor.capture());
        Map<String, Object> metrics = captor.getValue();

        assertEquals(1, metrics.size());
        assertEquals(2.0, (Double) metrics.get("http_requests_GET__getEndpoint"));
    }
}
