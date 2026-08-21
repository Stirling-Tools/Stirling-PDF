package stirling.software.SPDF.controller.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.search.Search;

import stirling.software.SPDF.config.EndpointInspector;
import stirling.software.SPDF.service.WeeklyActiveUsersService;
import stirling.software.common.model.ApplicationProperties;

/**
 * Covers MetricsController paths not exercised by the original test: unique user counts, per
 * endpoint aggregation, GET endpoint validation filtering, and exception fallbacks.
 */
@DisplayName("MetricsController extra coverage")
class MetricsControllerMoreTest {

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
        when(metrics.isEnabled()).thenReturn(true);
        controller =
                new MetricsController(
                        applicationProperties, meterRegistry, endpointInspector, Optional.empty());
        controller.init();
    }

    private Counter mockCounter(String uri, String session, double count) {
        Counter counter = mock(Counter.class);
        Meter.Id id = mock(Meter.Id.class);
        lenient().when(counter.getId()).thenReturn(id);
        lenient().when(id.getTag("uri")).thenReturn(uri);
        lenient().when(id.getTag("session")).thenReturn(session);
        lenient().when(counter.count()).thenReturn(count);
        return counter;
    }

    private void stubCounters(String method, List<Counter> counters) {
        Search search = mock(Search.class);
        Search taggedSearch = mock(Search.class);
        when(meterRegistry.find("http.requests")).thenReturn(search);
        when(search.tag("method", method)).thenReturn(taggedSearch);
        when(taggedSearch.counters()).thenReturn(counters);
    }

    @Nested
    @DisplayName("unique user counts")
    class UniqueUsers {

        @Test
        @DisplayName("getUniquePageLoads counts distinct sessions for GET")
        void uniquePageLoads() {
            stubCounters(
                    "GET",
                    List.of(
                            mockCounter("/a", "s1", 1.0),
                            mockCounter("/a", "s2", 1.0),
                            mockCounter("/a", "s1", 1.0)));
            when(endpointInspector.getValidGetEndpoints()).thenReturn(Collections.emptySet());

            ResponseEntity<?> resp = controller.getUniquePageLoads(Optional.empty());

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isEqualTo(2.0);
        }

        @Test
        @DisplayName("getUniqueTotalRequests counts distinct sessions for POST")
        void uniqueTotalRequests() {
            stubCounters(
                    "POST",
                    List.of(
                            mockCounter("/api/v1/x", "s1", 1.0),
                            mockCounter("/api/v1/x", "s1", 1.0)));

            ResponseEntity<?> resp = controller.getUniqueTotalRequests(Optional.empty());

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isEqualTo(1.0);
        }
    }

    @Nested
    @DisplayName("per-endpoint aggregation")
    class EndpointAggregation {

        @Test
        @DisplayName("getAllEndpointLoads aggregates GET counts sorted descending")
        void allEndpointLoads() {
            stubCounters(
                    "GET",
                    List.of(
                            mockCounter("/low", "s1", 2.0),
                            mockCounter("/high", "s1", 9.0),
                            mockCounter("/high", "s2", 1.0)));
            when(endpointInspector.getValidGetEndpoints()).thenReturn(Collections.emptySet());

            ResponseEntity<?> resp = controller.getAllEndpointLoads();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            List<MetricsController.EndpointCount> body =
                    (List<MetricsController.EndpointCount>) resp.getBody();
            assertThat(body).hasSize(2);
            assertThat(body.get(0).getEndpoint()).isEqualTo("/high");
            assertThat(body.get(0).getCount()).isEqualTo(10.0);
        }

        @Test
        @DisplayName("getAllPostRequests aggregates POST counts")
        void allPostRequests() {
            stubCounters("POST", List.of(mockCounter("/api/v1/convert", "s1", 4.0)));

            ResponseEntity<?> resp = controller.getAllPostRequests();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            List<MetricsController.EndpointCount> body =
                    (List<MetricsController.EndpointCount>) resp.getBody();
            assertThat(body).hasSize(1);
        }

        @Test
        @DisplayName("getAllUniqueEndpointLoads counts distinct sessions per endpoint")
        void allUniqueEndpointLoads() {
            stubCounters(
                    "GET",
                    List.of(
                            mockCounter("/p", "s1", 1.0),
                            mockCounter("/p", "s2", 1.0),
                            mockCounter("/p", "s1", 1.0)));

            ResponseEntity<?> resp = controller.getAllUniqueEndpointLoads();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            List<MetricsController.EndpointCount> body =
                    (List<MetricsController.EndpointCount>) resp.getBody();
            assertThat(body).hasSize(1);
            assertThat(body.get(0).getCount()).isEqualTo(2.0);
        }

        @Test
        @DisplayName("getAllUniquePostRequests aggregates distinct POST sessions")
        void allUniquePostRequests() {
            stubCounters("POST", List.of(mockCounter("/api/v1/y", "s1", 1.0)));

            ResponseEntity<?> resp = controller.getAllUniquePostRequests();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            List<MetricsController.EndpointCount> body =
                    (List<MetricsController.EndpointCount>) resp.getBody();
            assertThat(body).hasSize(1);
        }
    }

    @Nested
    @DisplayName("GET endpoint validation filtering")
    class GetValidation {

        @Test
        @DisplayName("invalid GET endpoints are filtered when a valid set exists")
        void filtersInvalidGetEndpoints() {
            stubCounters("GET", List.of(mockCounter("/valid", "s1", 5.0)));
            when(endpointInspector.getValidGetEndpoints()).thenReturn(Set.of("/valid"));
            when(endpointInspector.isValidGetEndpoint("/valid")).thenReturn(false);

            ResponseEntity<?> resp = controller.getPageLoads(Optional.empty());

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isEqualTo(0.0);
        }

        @Test
        @DisplayName("valid GET endpoints pass the validation filter")
        void keepsValidGetEndpoints() {
            stubCounters("GET", List.of(mockCounter("/valid", "s1", 5.0)));
            when(endpointInspector.getValidGetEndpoints()).thenReturn(Set.of("/valid"));
            when(endpointInspector.isValidGetEndpoint("/valid")).thenReturn(true);

            ResponseEntity<?> resp = controller.getPageLoads(Optional.empty());

            assertThat(resp.getBody()).isEqualTo(5.0);
        }

        @Test
        @DisplayName("null uri tag counters are skipped")
        void skipsNullUri() {
            stubCounters("GET", List.of(mockCounter(null, "s1", 5.0)));
            when(endpointInspector.getValidGetEndpoints()).thenReturn(Collections.emptySet());

            ResponseEntity<?> resp = controller.getPageLoads(Optional.empty());

            assertThat(resp.getBody()).isEqualTo(0.0);
        }
    }

    @Nested
    @DisplayName("exception fallbacks")
    class ExceptionFallbacks {

        @Test
        @DisplayName("getPageLoads returns 500 when the registry throws")
        void pageLoadsError() {
            when(meterRegistry.find("http.requests")).thenThrow(new RuntimeException("boom"));

            ResponseEntity<?> resp = controller.getPageLoads(Optional.empty());

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }

        @Test
        @DisplayName("getTotalRequests returns -1 body on error")
        void totalRequestsError() {
            when(meterRegistry.find("http.requests")).thenThrow(new RuntimeException("boom"));

            ResponseEntity<?> resp = controller.getTotalRequests(Optional.empty());

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isEqualTo(-1);
        }

        @Test
        @DisplayName("getUniqueTotalRequests returns -1 body on error")
        void uniqueTotalRequestsError() {
            when(meterRegistry.find("http.requests")).thenThrow(new RuntimeException("boom"));

            ResponseEntity<?> resp = controller.getUniqueTotalRequests(Optional.empty());

            assertThat(resp.getBody()).isEqualTo(-1);
        }

        @Test
        @DisplayName("getAllPostRequests returns 500 on error")
        void allPostRequestsError() {
            when(meterRegistry.find("http.requests")).thenThrow(new RuntimeException("boom"));

            ResponseEntity<?> resp = controller.getAllPostRequests();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }

        @Test
        @DisplayName("getAllUniqueEndpointLoads returns 500 on error")
        void allUniqueEndpointLoadsError() {
            when(meterRegistry.find("http.requests")).thenThrow(new RuntimeException("boom"));

            ResponseEntity<?> resp = controller.getAllUniqueEndpointLoads();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Nested
    @DisplayName("WAU present")
    class WauPresent {

        @Test
        @DisplayName("returns stats payload including trackingSince")
        void returnsStats() {
            WeeklyActiveUsersService wau = mock(WeeklyActiveUsersService.class);
            when(wau.getWeeklyActiveUsers()).thenReturn(3L);
            when(wau.getTotalUniqueBrowsers()).thenReturn(8L);
            when(wau.getDaysOnline()).thenReturn(2L);
            when(wau.getStartTime()).thenReturn(java.time.Instant.parse("2025-02-02T00:00:00Z"));
            MetricsController ctrl =
                    new MetricsController(
                            applicationProperties,
                            meterRegistry,
                            endpointInspector,
                            Optional.of(wau));
            ctrl.init();

            ResponseEntity<?> resp = ctrl.getWeeklyActiveUsers();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> body = (java.util.Map<String, Object>) resp.getBody();
            assertThat(body).containsEntry("weeklyActiveUsers", 3L);
            assertThat(body).containsKey("trackingSince");
        }
    }
}
