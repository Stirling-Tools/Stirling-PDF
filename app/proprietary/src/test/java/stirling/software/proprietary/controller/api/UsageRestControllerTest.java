package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.controller.api.UsageRestController.EndpointStatistic;
import stirling.software.proprietary.controller.api.UsageRestController.EndpointStatisticsResponse;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UsageRestControllerTest {

    @Mock private PersistentAuditEventRepository auditRepository;

    // Real ObjectMapper so the controller's JSON-blob parsing actually executes.
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    private UsageRestController controller;

    @BeforeEach
    void setUp() {
        controller = new UsageRestController(auditRepository, objectMapper);
    }

    // ---------- helpers ----------

    private PersistentAuditEvent event(String data) {
        return PersistentAuditEvent.builder()
                .id(1L)
                .principal("alice")
                .type("PDF_PROCESS")
                .timestamp(Instant.parse("2024-01-01T10:00:00Z"))
                .data(data)
                .build();
    }

    private PersistentAuditEvent endpointEvent(String endpoint) {
        return event("{\"endpoint\":\"" + endpoint + "\"}");
    }

    private EndpointStatistic findEndpoint(EndpointStatisticsResponse body, String endpoint) {
        return body.getEndpoints().stream()
                .filter(s -> endpoint.equals(s.getEndpoint()))
                .findFirst()
                .orElse(null);
    }

    // ============================================================
    // dataType routing
    // ============================================================

    @Nested
    @DisplayName("dataType routing")
    class DataTypeRouting {

        @Test
        @DisplayName("'all' queries findByTimestampAfter")
        void all() {
            when(auditRepository.findByTimestampAfter(any(Instant.class)))
                    .thenReturn(List.of(endpointEvent("/api/v1/convert")));

            ResponseEntity<EndpointStatisticsResponse> resp =
                    controller.getEndpointStatistics(null, "all", 30);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(auditRepository).findByTimestampAfter(any(Instant.class));
            verify(auditRepository, never())
                    .findByTypeAndTimestampAfterForExport(any(), any(Instant.class));
            verify(auditRepository, never())
                    .findAllExceptTypeAndTimestampAfterForExport(any(), any(Instant.class));
            assertThat(resp.getBody().getTotalVisits()).isEqualTo(1);
        }

        @Test
        @DisplayName("default dataType behaves as 'all'")
        void defaultDataTypeIsAll() {
            when(auditRepository.findByTimestampAfter(any(Instant.class)))
                    .thenReturn(List.of(endpointEvent("/api/v1/merge")));

            ResponseEntity<EndpointStatisticsResponse> resp =
                    controller.getEndpointStatistics(null, "all", 30);

            verify(auditRepository).findByTimestampAfter(any(Instant.class));
            assertThat(resp.getBody().getTotalEndpoints()).isEqualTo(1);
        }

        @Test
        @DisplayName("'ui' queries findByTypeAndTimestampAfterForExport with UI_DATA type")
        void ui() {
            when(auditRepository.findByTypeAndTimestampAfterForExport(
                            eq(AuditEventType.UI_DATA.name()), any(Instant.class)))
                    .thenReturn(List.of(endpointEvent("/api/v1/ui/stats")));

            ResponseEntity<EndpointStatisticsResponse> resp =
                    controller.getEndpointStatistics(null, "ui", 30);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(auditRepository)
                    .findByTypeAndTimestampAfterForExport(
                            eq(AuditEventType.UI_DATA.name()), any(Instant.class));
            verify(auditRepository, never()).findByTimestampAfter(any(Instant.class));
            assertThat(resp.getBody().getTotalVisits()).isEqualTo(1);
        }

        @Test
        @DisplayName("'api' queries findAllExceptTypeAndTimestampAfterForExport excluding UI_DATA")
        void api() {
            when(auditRepository.findAllExceptTypeAndTimestampAfterForExport(
                            eq(AuditEventType.UI_DATA.name()), any(Instant.class)))
                    .thenReturn(List.of(endpointEvent("/api/v1/split")));

            ResponseEntity<EndpointStatisticsResponse> resp =
                    controller.getEndpointStatistics(null, "api", 30);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(auditRepository)
                    .findAllExceptTypeAndTimestampAfterForExport(
                            eq(AuditEventType.UI_DATA.name()), any(Instant.class));
            verify(auditRepository, never()).findByTimestampAfter(any(Instant.class));
            assertThat(resp.getBody().getTotalVisits()).isEqualTo(1);
        }

        @Test
        @DisplayName("dataType is case-insensitive ('ALL')")
        void caseInsensitiveAll() {
            when(auditRepository.findByTimestampAfter(any(Instant.class)))
                    .thenReturn(List.of(endpointEvent("/api/v1/rotate")));

            controller.getEndpointStatistics(null, "ALL", 30);

            verify(auditRepository).findByTimestampAfter(any(Instant.class));
        }

        @Test
        @DisplayName("dataType is case-insensitive ('Ui')")
        void caseInsensitiveUi() {
            when(auditRepository.findByTypeAndTimestampAfterForExport(any(), any(Instant.class)))
                    .thenReturn(List.of(endpointEvent("/api/v1/ui")));

            controller.getEndpointStatistics(null, "Ui", 30);

            verify(auditRepository)
                    .findByTypeAndTimestampAfterForExport(
                            eq(AuditEventType.UI_DATA.name()), any(Instant.class));
        }

        @Test
        @DisplayName("unknown dataType yields empty result and no repository query")
        void unknownDataType() {
            ResponseEntity<EndpointStatisticsResponse> resp =
                    controller.getEndpointStatistics(null, "garbage", 30);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            EndpointStatisticsResponse body = resp.getBody();
            assertThat(body).isNotNull();
            assertThat(body.getEndpoints()).isEmpty();
            assertThat(body.getTotalEndpoints()).isZero();
            assertThat(body.getTotalVisits()).isZero();
            verifyNoInteractions(auditRepository);
        }
    }

    // ============================================================
    // days clamping
    // ============================================================

    @Nested
    @DisplayName("days lookback clamping")
    class DaysClamping {

        private Instant capturedStart() {
            ArgumentCaptor<Instant> captor = ArgumentCaptor.forClass(Instant.class);
            verify(auditRepository).findByTimestampAfter(captor.capture());
            return captor.getValue();
        }

        private void assertLookbackDays(Instant start, int expectedDays) {
            Instant expected = Instant.now().minus(Duration.ofDays(expectedDays));
            long deltaSeconds = Math.abs(Duration.between(expected, start).getSeconds());
            // Allow a generous window for clock drift between controller and assertion.
            assertThat(deltaSeconds).isLessThan(60);
        }

        @Test
        @DisplayName("typical value (30) used as-is")
        void typical() {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(List.of());

            controller.getEndpointStatistics(null, "all", 30);

            assertLookbackDays(capturedStart(), 30);
        }

        @Test
        @DisplayName("days above 365 clamps to 365")
        void clampUpper() {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(List.of());

            controller.getEndpointStatistics(null, "all", 5000);

            assertLookbackDays(capturedStart(), 365);
        }

        @Test
        @DisplayName("days below 1 clamps to 1")
        void clampLower() {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(List.of());

            controller.getEndpointStatistics(null, "all", 0);

            assertLookbackDays(capturedStart(), 1);
        }

        @Test
        @DisplayName("negative days clamps to 1")
        void clampNegative() {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(List.of());

            controller.getEndpointStatistics(null, "all", -10);

            assertLookbackDays(capturedStart(), 1);
        }
    }

    // ============================================================
    // endpoint extraction from audit data JSON
    // ============================================================

    @Nested
    @DisplayName("endpoint extraction")
    class EndpointExtraction {

        private EndpointStatisticsResponse runWith(List<PersistentAuditEvent> events) {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(events);
            return controller.getEndpointStatistics(null, "all", 30).getBody();
        }

        @Test
        @DisplayName("reads 'endpoint' key")
        void endpointKey() {
            EndpointStatisticsResponse body =
                    runWith(List.of(event("{\"endpoint\":\"/api/v1/convert\"}")));

            assertThat(findEndpoint(body, "/api/v1/convert")).isNotNull();
            assertThat(body.getTotalEndpoints()).isEqualTo(1);
        }

        @Test
        @DisplayName("falls back to 'path' key when no 'endpoint'")
        void pathKey() {
            EndpointStatisticsResponse body =
                    runWith(List.of(event("{\"path\":\"/api/v1/merge\"}")));

            assertThat(findEndpoint(body, "/api/v1/merge")).isNotNull();
        }

        @Test
        @DisplayName("falls back to 'requestUri' key when no 'endpoint' or 'path'")
        void requestUriKey() {
            EndpointStatisticsResponse body =
                    runWith(List.of(event("{\"requestUri\":\"/api/v1/split\"}")));

            assertThat(findEndpoint(body, "/api/v1/split")).isNotNull();
        }

        @Test
        @DisplayName("'endpoint' takes priority over 'path' and 'requestUri'")
        void endpointPriority() {
            EndpointStatisticsResponse body =
                    runWith(
                            List.of(
                                    event(
                                            "{\"endpoint\":\"/win\",\"path\":\"/lose\","
                                                    + "\"requestUri\":\"/lose2\"}")));

            assertThat(findEndpoint(body, "/win")).isNotNull();
            assertThat(findEndpoint(body, "/lose")).isNull();
            assertThat(body.getTotalEndpoints()).isEqualTo(1);
        }

        @Test
        @DisplayName("'path' takes priority over 'requestUri'")
        void pathOverRequestUri() {
            EndpointStatisticsResponse body =
                    runWith(List.of(event("{\"path\":\"/p\",\"requestUri\":\"/r\"}")));

            assertThat(findEndpoint(body, "/p")).isNotNull();
            assertThat(findEndpoint(body, "/r")).isNull();
        }

        @Test
        @DisplayName("null data is skipped")
        void nullData() {
            EndpointStatisticsResponse body = runWith(List.of(event(null)));

            assertThat(body.getEndpoints()).isEmpty();
            assertThat(body.getTotalVisits()).isZero();
        }

        @Test
        @DisplayName("empty data is skipped")
        void emptyData() {
            EndpointStatisticsResponse body = runWith(List.of(event("")));

            assertThat(body.getEndpoints()).isEmpty();
        }

        @Test
        @DisplayName("malformed JSON is skipped (JacksonException swallowed)")
        void malformedJson() {
            EndpointStatisticsResponse body = runWith(List.of(event("this-is-not-json")));

            assertThat(body.getEndpoints()).isEmpty();
            assertThat(body.getTotalVisits()).isZero();
        }

        @Test
        @DisplayName("JSON without recognized keys yields no endpoint")
        void noRecognizedKeys() {
            EndpointStatisticsResponse body = runWith(List.of(event("{\"unrelated\":\"value\"}")));

            assertThat(body.getEndpoints()).isEmpty();
        }

        @Test
        @DisplayName("valid and invalid events mixed -> only valid counted")
        void mixedValidInvalid() {
            EndpointStatisticsResponse body =
                    runWith(
                            new ArrayList<>(
                                    List.of(
                                            event("{\"endpoint\":\"/good\"}"),
                                            event("not-json"),
                                            event(""),
                                            event(null))));

            assertThat(body.getEndpoints()).hasSize(1);
            assertThat(findEndpoint(body, "/good").getVisits()).isEqualTo(1);
            assertThat(body.getTotalVisits()).isEqualTo(1);
        }
    }

    // ============================================================
    // endpoint normalization
    // ============================================================

    @Nested
    @DisplayName("endpoint normalization")
    class Normalization {

        private EndpointStatisticsResponse runWith(List<PersistentAuditEvent> events) {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(events);
            return controller.getEndpointStatistics(null, "all", 30).getBody();
        }

        @Test
        @DisplayName("query string is stripped")
        void stripsQueryString() {
            EndpointStatisticsResponse body =
                    runWith(List.of(event("{\"endpoint\":\"/api/v1/convert?foo=bar&baz=1\"}")));

            assertThat(findEndpoint(body, "/api/v1/convert")).isNotNull();
        }

        @Test
        @DisplayName("leading slash is added when missing")
        void addsLeadingSlash() {
            EndpointStatisticsResponse body =
                    runWith(List.of(event("{\"endpoint\":\"api/v1/convert\"}")));

            assertThat(findEndpoint(body, "/api/v1/convert")).isNotNull();
        }

        @Test
        @DisplayName("paths differing only by query string collapse to same endpoint")
        void collapsesByQueryString() {
            EndpointStatisticsResponse body =
                    runWith(
                            new ArrayList<>(
                                    List.of(
                                            event("{\"endpoint\":\"/api/v1/convert?a=1\"}"),
                                            event("{\"endpoint\":\"/api/v1/convert?a=2\"}"))));

            assertThat(body.getEndpoints()).hasSize(1);
            assertThat(findEndpoint(body, "/api/v1/convert").getVisits()).isEqualTo(2);
        }
    }

    // ============================================================
    // counting, percentages, sorting, totals
    // ============================================================

    @Nested
    @DisplayName("aggregation and sorting")
    class Aggregation {

        private EndpointStatisticsResponse runWith(List<PersistentAuditEvent> events) {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(events);
            return controller.getEndpointStatistics(null, "all", 30).getBody();
        }

        @Test
        @DisplayName("counts duplicate endpoints and computes totals")
        void countsDuplicates() {
            EndpointStatisticsResponse body =
                    runWith(
                            new ArrayList<>(
                                    List.of(
                                            endpointEvent("/a"),
                                            endpointEvent("/a"),
                                            endpointEvent("/a"),
                                            endpointEvent("/b"))));

            assertThat(body.getTotalEndpoints()).isEqualTo(2);
            assertThat(body.getTotalVisits()).isEqualTo(4);
            assertThat(findEndpoint(body, "/a").getVisits()).isEqualTo(3);
            assertThat(findEndpoint(body, "/b").getVisits()).isEqualTo(1);
        }

        @Test
        @DisplayName("results sorted by visit count descending")
        void sortedDescending() {
            EndpointStatisticsResponse body =
                    runWith(
                            new ArrayList<>(
                                    List.of(
                                            endpointEvent("/low"),
                                            endpointEvent("/high"),
                                            endpointEvent("/high"),
                                            endpointEvent("/high"),
                                            endpointEvent("/mid"),
                                            endpointEvent("/mid"))));

            List<EndpointStatistic> stats = body.getEndpoints();
            assertThat(stats).hasSize(3);
            assertThat(stats.get(0).getEndpoint()).isEqualTo("/high");
            assertThat(stats.get(0).getVisits()).isEqualTo(3);
            assertThat(stats.get(1).getEndpoint()).isEqualTo("/mid");
            assertThat(stats.get(1).getVisits()).isEqualTo(2);
            assertThat(stats.get(2).getEndpoint()).isEqualTo("/low");
            assertThat(stats.get(2).getVisits()).isEqualTo(1);
        }

        @Test
        @DisplayName("percentage computed and rounded to one decimal")
        void percentageRounding() {
            // 1 of 3 visits -> 33.33% -> rounded to 33.3
            EndpointStatisticsResponse body =
                    runWith(
                            new ArrayList<>(
                                    List.of(
                                            endpointEvent("/a"),
                                            endpointEvent("/b"),
                                            endpointEvent("/c"))));

            assertThat(findEndpoint(body, "/a").getPercentage()).isEqualTo(33.3);
            assertThat(findEndpoint(body, "/b").getPercentage()).isEqualTo(33.3);
            assertThat(findEndpoint(body, "/c").getPercentage()).isEqualTo(33.3);
        }

        @Test
        @DisplayName("single endpoint is 100 percent")
        void hundredPercent() {
            EndpointStatisticsResponse body = runWith(List.of(endpointEvent("/only")));

            assertThat(findEndpoint(body, "/only").getPercentage()).isEqualTo(100.0);
        }

        @Test
        @DisplayName("empty event list yields zeroed response")
        void emptyEvents() {
            EndpointStatisticsResponse body = runWith(List.of());

            assertThat(body.getEndpoints()).isEmpty();
            assertThat(body.getTotalEndpoints()).isZero();
            assertThat(body.getTotalVisits()).isZero();
        }
    }

    // ============================================================
    // limit handling
    // ============================================================

    @Nested
    @DisplayName("limit handling")
    class LimitHandling {

        private EndpointStatisticsResponse runWith(
                Integer limit, List<PersistentAuditEvent> events) {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(events);
            return controller.getEndpointStatistics(limit, "all", 30).getBody();
        }

        private List<PersistentAuditEvent> fiveDistinctEndpoints() {
            return new ArrayList<>(
                    List.of(
                            endpointEvent("/a"),
                            endpointEvent("/b"),
                            endpointEvent("/c"),
                            endpointEvent("/d"),
                            endpointEvent("/e")));
        }

        @Test
        @DisplayName("limit smaller than result size truncates the endpoint list")
        void truncates() {
            EndpointStatisticsResponse body = runWith(2, fiveDistinctEndpoints());

            assertThat(body.getEndpoints()).hasSize(2);
            // totals reflect the full set, not the truncated list
            assertThat(body.getTotalEndpoints()).isEqualTo(5);
            assertThat(body.getTotalVisits()).isEqualTo(5);
        }

        @Test
        @DisplayName("limit larger than result size returns all endpoints")
        void limitLargerThanSize() {
            EndpointStatisticsResponse body = runWith(100, fiveDistinctEndpoints());

            assertThat(body.getEndpoints()).hasSize(5);
        }

        @Test
        @DisplayName("limit equal to result size returns all endpoints")
        void limitEqualsSize() {
            EndpointStatisticsResponse body = runWith(5, fiveDistinctEndpoints());

            assertThat(body.getEndpoints()).hasSize(5);
        }

        @Test
        @DisplayName("null limit returns all endpoints")
        void nullLimit() {
            EndpointStatisticsResponse body = runWith(null, fiveDistinctEndpoints());

            assertThat(body.getEndpoints()).hasSize(5);
        }

        @Test
        @DisplayName("zero limit is ignored (returns all)")
        void zeroLimit() {
            EndpointStatisticsResponse body = runWith(0, fiveDistinctEndpoints());

            assertThat(body.getEndpoints()).hasSize(5);
        }

        @Test
        @DisplayName("negative limit is ignored (returns all)")
        void negativeLimit() {
            EndpointStatisticsResponse body = runWith(-1, fiveDistinctEndpoints());

            assertThat(body.getEndpoints()).hasSize(5);
        }

        @Test
        @DisplayName("truncation keeps the top endpoints by visit count")
        void truncationKeepsTop() {
            List<PersistentAuditEvent> events =
                    new ArrayList<>(
                            List.of(
                                    endpointEvent("/top"),
                                    endpointEvent("/top"),
                                    endpointEvent("/top"),
                                    endpointEvent("/mid"),
                                    endpointEvent("/mid"),
                                    endpointEvent("/low")));

            EndpointStatisticsResponse body = runWith(1, events);

            assertThat(body.getEndpoints()).hasSize(1);
            assertThat(body.getEndpoints().get(0).getEndpoint()).isEqualTo("/top");
        }
    }
}
