package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.controller.api.AuditRestController.AuditChartsData;
import stirling.software.proprietary.controller.api.AuditRestController.AuditEventDto;
import stirling.software.proprietary.controller.api.AuditRestController.AuditEventsResponse;
import stirling.software.proprietary.controller.api.AuditRestController.AuditStatsData;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuditRestControllerTest {

    @Mock private PersistentAuditEventRepository auditRepository;

    // Real ObjectMapper so JSON-blob parsing in the controller actually runs.
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    private AuditRestController controller;

    @BeforeEach
    void setUp() {
        controller = new AuditRestController(auditRepository, objectMapper);
    }

    // ---------- helpers ----------

    private PersistentAuditEvent event(
            long id, String principal, String type, Instant ts, String data) {
        return PersistentAuditEvent.builder()
                .id(id)
                .principal(principal)
                .type(type)
                .timestamp(ts)
                .data(data)
                .build();
    }

    private Page<PersistentAuditEvent> page(List<PersistentAuditEvent> content) {
        return new PageImpl<>(content, PageRequest.of(0, 30), content.size());
    }

    // ============================================================
    // getAuditEvents
    // ============================================================

    @Nested
    @DisplayName("getAuditEvents")
    class GetAuditEvents {

        @Test
        @DisplayName("no filters -> findAll and maps content to DTOs")
        void noFilters() {
            PersistentAuditEvent e =
                    event(1L, "alice", "USER_LOGIN", Instant.parse("2024-01-01T10:00:00Z"), null);
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of(e)));

            ResponseEntity<AuditEventsResponse> resp =
                    controller.getAuditEvents(0, 30, null, null, null, null);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            AuditEventsResponse body = resp.getBody();
            assertThat(body).isNotNull();
            assertThat(body.getEvents()).hasSize(1);
            assertThat(body.getTotalEvents()).isEqualTo(1);
            assertThat(body.getPage()).isEqualTo(0);
            assertThat(body.getPageSize()).isEqualTo(30);
            assertThat(body.getTotalPages()).isEqualTo(1);

            AuditEventDto dto = body.getEvents().get(0);
            assertThat(dto.getId()).isEqualTo("1");
            assertThat(dto.getEventType()).isEqualTo("USER_LOGIN");
            assertThat(dto.getUsername()).isEqualTo("alice");
            assertThat(dto.getIpAddress()).isEmpty();
            assertThat(dto.getDetails()).isEmpty();
            verify(auditRepository).findAll(any(Pageable.class));
        }

        @Test
        @DisplayName("pageable carries page/size and timestamp desc sort")
        void pageableIsConstructedCorrectly() {
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of()));

            controller.getAuditEvents(2, 15, null, null, null, null);

            ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
            verify(auditRepository).findAll(captor.capture());
            Pageable pageable = captor.getValue();
            assertThat(pageable.getPageNumber()).isEqualTo(2);
            assertThat(pageable.getPageSize()).isEqualTo(15);
            assertThat(pageable.getSort().getOrderFor("timestamp")).isNotNull();
            assertThat(pageable.getSort().getOrderFor("timestamp").isDescending()).isTrue();
        }

        @Test
        @DisplayName("empty arrays are treated as no filter -> findAll")
        void emptyArraysFallThroughToFindAll() {
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of()));

            controller.getAuditEvents(0, 30, new String[] {}, new String[] {}, null, null);

            verify(auditRepository).findAll(any(Pageable.class));
            verify(auditRepository, never()).findByTypeIn(anyList(), any());
            verify(auditRepository, never()).findByPrincipalIn(anyList(), any());
        }

        @Test
        @DisplayName("eventType only -> findByTypeIn")
        void eventTypeOnly() {
            when(auditRepository.findByTypeIn(anyList(), any())).thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0, 30, new String[] {"USER_LOGIN", "USER_LOGOUT"}, null, null, null);

            ArgumentCaptor<List<String>> types = ArgumentCaptor.forClass(List.class);
            verify(auditRepository).findByTypeIn(types.capture(), any());
            assertThat(types.getValue()).containsExactly("USER_LOGIN", "USER_LOGOUT");
        }

        @Test
        @DisplayName("username only -> findByPrincipalIn")
        void usernameOnly() {
            when(auditRepository.findByPrincipalIn(anyList(), any())).thenReturn(page(List.of()));

            controller.getAuditEvents(0, 30, null, new String[] {"bob"}, null, null);

            verify(auditRepository).findByPrincipalIn(eq(List.of("bob")), any());
        }

        @Test
        @DisplayName("date range only -> findByTimestampBetween with end = endDate+1 day")
        void dateRangeOnly() {
            when(auditRepository.findByTimestampBetween(any(), any(), any()))
                    .thenReturn(page(List.of()));

            LocalDate start = LocalDate.of(2024, 1, 1);
            LocalDate end = LocalDate.of(2024, 1, 31);
            controller.getAuditEvents(0, 30, null, null, start, end);

            verify(auditRepository).findByTimestampBetween(any(), any(), any());
            verify(auditRepository, never()).findAll(any(Pageable.class));
        }

        @Test
        @DisplayName("only startDate (no endDate) -> dates ignored, findAll used")
        void onlyStartDateIgnored() {
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of()));

            controller.getAuditEvents(0, 30, null, null, LocalDate.of(2024, 1, 1), null);

            verify(auditRepository).findAll(any(Pageable.class));
            verify(auditRepository, never()).findByTimestampBetween(any(), any(), any());
        }

        @Test
        @DisplayName("eventType + username -> findByTypeInAndPrincipalIn")
        void eventTypeAndUsername() {
            when(auditRepository.findByTypeInAndPrincipalIn(anyList(), anyList(), any()))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0, 30, new String[] {"USER_LOGIN"}, new String[] {"alice"}, null, null);

            verify(auditRepository).findByTypeInAndPrincipalIn(anyList(), anyList(), any());
        }

        @Test
        @DisplayName("eventType + date range -> findByTypeInAndTimestampBetween")
        void eventTypeAndDateRange() {
            when(auditRepository.findByTypeInAndTimestampBetween(anyList(), any(), any(), any()))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0,
                    30,
                    new String[] {"USER_LOGIN"},
                    null,
                    LocalDate.of(2024, 1, 1),
                    LocalDate.of(2024, 1, 31));

            verify(auditRepository).findByTypeInAndTimestampBetween(anyList(), any(), any(), any());
        }

        @Test
        @DisplayName("username + date range -> findByPrincipalInAndTimestampBetween")
        void usernameAndDateRange() {
            when(auditRepository.findByPrincipalInAndTimestampBetween(
                            anyList(), any(), any(), any()))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0,
                    30,
                    null,
                    new String[] {"alice"},
                    LocalDate.of(2024, 1, 1),
                    LocalDate.of(2024, 1, 31));

            verify(auditRepository)
                    .findByPrincipalInAndTimestampBetween(anyList(), any(), any(), any());
        }

        @Test
        @DisplayName("all filters -> findByTypeInAndPrincipalInAndTimestampBetween")
        void allFilters() {
            when(auditRepository.findByTypeInAndPrincipalInAndTimestampBetween(
                            anyList(), anyList(), any(), any(), any()))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0,
                    30,
                    new String[] {"USER_LOGIN"},
                    new String[] {"alice"},
                    LocalDate.of(2024, 1, 1),
                    LocalDate.of(2024, 1, 31));

            verify(auditRepository)
                    .findByTypeInAndPrincipalInAndTimestampBetween(
                            anyList(), anyList(), any(), any(), any());
        }

        @Test
        @DisplayName("DTO parses JSON data and extracts clientIp")
        void dtoParsesClientIp() {
            String json = "{\"clientIp\":\"10.0.0.5\",\"foo\":\"bar\"}";
            PersistentAuditEvent e =
                    event(7L, "alice", "HTTP_REQUEST", Instant.parse("2024-05-01T00:00:00Z"), json);
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of(e)));

            AuditEventDto dto =
                    controller
                            .getAuditEvents(0, 30, null, null, null, null)
                            .getBody()
                            .getEvents()
                            .get(0);

            assertThat(dto.getIpAddress()).isEqualTo("10.0.0.5");
            assertThat(dto.getDetails()).containsEntry("foo", "bar");
        }

        @Test
        @DisplayName("DTO falls back to __ipAddress when clientIp absent")
        void dtoFallsBackToUnderscoreIp() {
            String json = "{\"__ipAddress\":\"192.168.1.1\"}";
            PersistentAuditEvent e =
                    event(8L, "alice", "HTTP_REQUEST", Instant.parse("2024-05-01T00:00:00Z"), json);
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of(e)));

            AuditEventDto dto =
                    controller
                            .getAuditEvents(0, 30, null, null, null, null)
                            .getBody()
                            .getEvents()
                            .get(0);

            assertThat(dto.getIpAddress()).isEqualTo("192.168.1.1");
        }

        @Test
        @DisplayName("DTO with invalid JSON keeps rawData and warns (no throw)")
        void dtoInvalidJsonKeepsRawData() {
            String bad = "this-is-not-json";
            PersistentAuditEvent e =
                    event(9L, "alice", "HTTP_REQUEST", Instant.parse("2024-05-01T00:00:00Z"), bad);
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of(e)));

            AuditEventDto dto =
                    controller
                            .getAuditEvents(0, 30, null, null, null, null)
                            .getBody()
                            .getEvents()
                            .get(0);

            assertThat(dto.getDetails()).containsEntry("rawData", bad);
            assertThat(dto.getIpAddress()).isEmpty();
        }

        @Test
        @DisplayName("empty-string data leaves details empty")
        void dtoEmptyData() {
            PersistentAuditEvent e =
                    event(10L, "alice", "USER_LOGIN", Instant.parse("2024-05-01T00:00:00Z"), "");
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of(e)));

            AuditEventDto dto =
                    controller
                            .getAuditEvents(0, 30, null, null, null, null)
                            .getBody()
                            .getEvents()
                            .get(0);

            assertThat(dto.getDetails()).isEmpty();
            assertThat(dto.getIpAddress()).isEmpty();
        }
    }

    // ============================================================
    // getAuditCharts
    // ============================================================

    @Nested
    @DisplayName("getAuditCharts")
    class GetAuditCharts {

        @Test
        @DisplayName("default period (week) queries 7 days back and groups by type/user/day")
        void defaultWeek() {
            Instant ts = Instant.parse("2024-03-15T12:00:00Z");
            List<PersistentAuditEvent> events =
                    List.of(
                            event(1L, "alice", "USER_LOGIN", ts, null),
                            event(2L, "alice", "USER_LOGIN", ts, null),
                            event(3L, "bob", "PDF_PROCESS", ts, null));
            when(auditRepository.findByTimestampAfter(any())).thenReturn(events);

            ResponseEntity<AuditChartsData> resp = controller.getAuditCharts("week");

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            AuditChartsData data = resp.getBody();
            assertThat(data).isNotNull();
            // events by type: USER_LOGIN=2, PDF_PROCESS=1 -> total values sum to 3
            assertThat(
                            data.getEventsByType().getValues().stream()
                                    .mapToInt(Integer::intValue)
                                    .sum())
                    .isEqualTo(3);
            assertThat(data.getEventsByType().getLabels())
                    .containsExactlyInAnyOrder("USER_LOGIN", "PDF_PROCESS");
            // events by user: alice=2, bob=1
            assertThat(data.getEventsByUser().getLabels())
                    .containsExactlyInAnyOrder("alice", "bob");
            // single day
            assertThat(data.getEventsOverTime().getLabels()).hasSize(1);
            assertThat(data.getEventsOverTime().getValues()).containsExactly(3);
        }

        @Test
        @DisplayName("empty events -> empty chart series, still 200")
        void emptyEvents() {
            when(auditRepository.findByTimestampAfter(any())).thenReturn(Collections.emptyList());

            AuditChartsData data = controller.getAuditCharts("week").getBody();

            assertThat(data).isNotNull();
            assertThat(data.getEventsByType().getLabels()).isEmpty();
            assertThat(data.getEventsByUser().getLabels()).isEmpty();
            assertThat(data.getEventsOverTime().getLabels()).isEmpty();
        }

        @Test
        @DisplayName("over-time labels are sorted ascending across multiple days")
        void overTimeSorted() {
            Instant day2 = Instant.parse("2024-03-02T08:00:00Z");
            Instant day1 = Instant.parse("2024-03-01T08:00:00Z");
            List<PersistentAuditEvent> events =
                    List.of(event(1L, "a", "T", day2, null), event(2L, "a", "T", day1, null));
            when(auditRepository.findByTimestampAfter(any())).thenReturn(events);

            AuditChartsData data = controller.getAuditCharts("month").getBody();

            List<String> labels = data.getEventsOverTime().getLabels();
            assertThat(labels).hasSize(2);
            assertThat(labels).isSorted();
        }

        @Test
        @DisplayName("unknown period defaults to week branch (still queries once)")
        void unknownPeriodDefaults() {
            when(auditRepository.findByTimestampAfter(any())).thenReturn(Collections.emptyList());

            ResponseEntity<AuditChartsData> resp = controller.getAuditCharts("nonsense");

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(auditRepository).findByTimestampAfter(any());
        }

        @Test
        @DisplayName("day and month periods are accepted (case-insensitive)")
        void dayAndMonthAccepted() {
            when(auditRepository.findByTimestampAfter(any())).thenReturn(Collections.emptyList());

            assertThat(controller.getAuditCharts("DAY").getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(controller.getAuditCharts("Month").getStatusCode()).isEqualTo(HttpStatus.OK);
        }
    }

    // ============================================================
    // getEventTypes
    // ============================================================

    @Nested
    @DisplayName("getEventTypes")
    class GetEventTypes {

        @Test
        @DisplayName("combines db types and enum types, deduped and sorted")
        void combinesAndSorts() {
            when(auditRepository.findDistinctEventTypes())
                    .thenReturn(List.of("CUSTOM_TYPE", "USER_LOGIN"));

            ResponseEntity<List<String>> resp = controller.getEventTypes();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            List<String> result = resp.getBody();
            assertThat(result).isNotNull();
            // custom type plus every enum value present
            assertThat(result).contains("CUSTOM_TYPE");
            for (AuditEventType t : AuditEventType.values()) {
                assertThat(result).contains(t.name());
            }
            // USER_LOGIN appears once (deduped)
            assertThat(result.stream().filter("USER_LOGIN"::equals).count()).isEqualTo(1L);
            // sorted ascending
            assertThat(result).isSorted();
        }

        @Test
        @DisplayName("empty db types -> only enum types returned")
        void emptyDbTypes() {
            when(auditRepository.findDistinctEventTypes()).thenReturn(Collections.emptyList());

            List<String> result = controller.getEventTypes().getBody();

            assertThat(result).hasSize(AuditEventType.values().length);
            assertThat(result).isSorted();
        }
    }

    // ============================================================
    // getUsers
    // ============================================================

    @Nested
    @DisplayName("getUsers")
    class GetUsers {

        @Test
        @DisplayName("maps countByPrincipal rows to sorted usernames")
        void mapsAndSorts() {
            List<Object[]> rows =
                    List.of(
                            new Object[] {"charlie", 3L},
                            new Object[] {"alice", 5L},
                            new Object[] {"bob", 1L});
            when(auditRepository.countByPrincipal()).thenReturn(rows);

            ResponseEntity<List<String>> resp = controller.getUsers();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).containsExactly("alice", "bob", "charlie");
        }

        @Test
        @DisplayName("empty principals -> empty list")
        void emptyUsers() {
            when(auditRepository.countByPrincipal()).thenReturn(Collections.emptyList());

            assertThat(controller.getUsers().getBody()).isEmpty();
        }
    }

    // ============================================================
    // getAuditStats / computeMetrics
    // ============================================================

    @Nested
    @DisplayName("getAuditStats")
    class GetAuditStats {

        @Test
        @DisplayName("empty current + prev events yields zeroed stats and full 24-hour buckets")
        void emptyStats() {
            when(auditRepository.findByTimestampAfter(any())).thenReturn(Collections.emptyList());
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(Collections.emptyList());

            ResponseEntity<AuditStatsData> resp = controller.getAuditStats("week");

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            AuditStatsData data = resp.getBody();
            assertThat(data).isNotNull();
            assertThat(data.getTotalEvents()).isZero();
            assertThat(data.getPrevTotalEvents()).isZero();
            assertThat(data.getUniqueUsers()).isZero();
            assertThat(data.getSuccessRate()).isZero();
            assertThat(data.getAvgLatencyMs()).isZero();
            assertThat(data.getErrorCount()).isZero();
            assertThat(data.getTopEventType()).isNull();
            assertThat(data.getTopUser()).isNull();
            // hourly distribution is always padded to 24 buckets
            assertThat(data.getHourlyDistribution()).hasSize(24);
            assertThat(data.getHourlyDistribution().get("00")).isEqualTo(0L);
            assertThat(data.getHourlyDistribution().get("23")).isEqualTo(0L);
        }

        @Test
        @DisplayName("computes success rate, latency, error count, top type/user/tool from JSON")
        void computesRichMetrics() {
            Instant ts = Instant.parse("2024-03-15T12:00:00Z");
            List<PersistentAuditEvent> events =
                    new ArrayList<>(
                            List.of(
                                    event(
                                            1L,
                                            "alice",
                                            "PDF_PROCESS",
                                            ts,
                                            "{\"status\":\"success\",\"latencyMs\":100,\"path\":\"/api/v1/merge\"}"),
                                    event(
                                            2L,
                                            "alice",
                                            "PDF_PROCESS",
                                            ts,
                                            "{\"status\":\"failure\",\"latencyMs\":200,\"path\":\"/api/v1/merge\"}"),
                                    event(
                                            3L,
                                            "bob",
                                            "HTTP_REQUEST",
                                            ts,
                                            "{\"status\":\"success\",\"latencyMs\":\"300\",\"path\":\"/api/v1/split\"}")));
            when(auditRepository.findByTimestampAfter(any())).thenReturn(events);
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(Collections.emptyList());

            AuditStatsData data = controller.getAuditStats("week").getBody();

            assertThat(data.getTotalEvents()).isEqualTo(3);
            assertThat(data.getUniqueUsers()).isEqualTo(2);
            // 2 success, 1 failure -> 2/3 * 100
            assertThat(data.getSuccessRate()).isEqualTo(200.0 / 3.0);
            // (100+200+300)/3
            assertThat(data.getAvgLatencyMs()).isEqualTo(200.0);
            // one explicit failure
            assertThat(data.getErrorCount()).isEqualTo(1);
            assertThat(data.getTopEventType()).isEqualTo("PDF_PROCESS");
            assertThat(data.getTopUser()).isEqualTo("alice");
            // tool extracted from last path segment: merge=2, split=1
            assertThat(data.getTopTools()).containsEntry("merge", 2L);
            assertThat(data.getTopTools()).containsEntry("split", 1L);
        }

        @Test
        @DisplayName("statusCode >= 400 (without explicit failure) counts as error")
        void statusCodeErrorCounting() {
            Instant ts = Instant.parse("2024-03-15T12:00:00Z");
            List<PersistentAuditEvent> events =
                    List.of(
                            event(1L, "alice", "HTTP_REQUEST", ts, "{\"statusCode\":500}"),
                            event(2L, "alice", "HTTP_REQUEST", ts, "{\"statusCode\":\"404\"}"),
                            event(3L, "alice", "HTTP_REQUEST", ts, "{\"statusCode\":200}"));
            when(auditRepository.findByTimestampAfter(any())).thenReturn(events);
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(Collections.emptyList());

            AuditStatsData data = controller.getAuditStats("week").getBody();

            // 500 and 404 -> 2 errors; 200 not counted
            assertThat(data.getErrorCount()).isEqualTo(2);
            // no explicit success/failure outcome -> success rate stays 0
            assertThat(data.getSuccessRate()).isZero();
        }

        @Test
        @DisplayName("legacy 'outcome' key is treated like status")
        void legacyOutcomeKey() {
            Instant ts = Instant.parse("2024-03-15T12:00:00Z");
            List<PersistentAuditEvent> events =
                    List.of(
                            event(1L, "alice", "T", ts, "{\"outcome\":\"success\"}"),
                            event(2L, "alice", "T", ts, "{\"outcome\":\"failure\"}"));
            when(auditRepository.findByTimestampAfter(any())).thenReturn(events);
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(Collections.emptyList());

            AuditStatsData data = controller.getAuditStats("week").getBody();

            assertThat(data.getSuccessRate()).isEqualTo(50.0);
            assertThat(data.getErrorCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("invalid JSON in data is skipped without throwing")
        void invalidJsonSkipped() {
            Instant ts = Instant.parse("2024-03-15T12:00:00Z");
            List<PersistentAuditEvent> events =
                    List.of(
                            event(1L, "alice", "T", ts, "not-json"),
                            event(2L, "alice", "T", ts, null));
            when(auditRepository.findByTimestampAfter(any())).thenReturn(events);
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(Collections.emptyList());

            AuditStatsData data = controller.getAuditStats("week").getBody();

            assertThat(data.getTotalEvents()).isEqualTo(2);
            assertThat(data.getErrorCount()).isZero();
            assertThat(data.getSuccessRate()).isZero();
        }

        @Test
        @DisplayName("non-numeric latency/statusCode strings are ignored, not fatal")
        void unparseableNumericsIgnored() {
            Instant ts = Instant.parse("2024-03-15T12:00:00Z");
            List<PersistentAuditEvent> events =
                    List.of(
                            event(
                                    1L,
                                    "alice",
                                    "T",
                                    ts,
                                    "{\"latencyMs\":\"abc\",\"statusCode\":\"xyz\"}"));
            when(auditRepository.findByTimestampAfter(any())).thenReturn(events);
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(Collections.emptyList());

            AuditStatsData data = controller.getAuditStats("week").getBody();

            assertThat(data.getAvgLatencyMs()).isZero();
            assertThat(data.getErrorCount()).isZero();
        }

        @Test
        @DisplayName("histogram rows populate matching hour buckets")
        void histogramBuckets() {
            when(auditRepository.findByTimestampAfter(any())).thenReturn(Collections.emptyList());
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(List.of(new Object[] {9, 4L}, new Object[] {14, 7L}));

            AuditStatsData data = controller.getAuditStats("week").getBody();

            assertThat(data.getHourlyDistribution().get("09")).isEqualTo(4L);
            assertThat(data.getHourlyDistribution().get("14")).isEqualTo(7L);
            assertThat(data.getHourlyDistribution().get("00")).isEqualTo(0L);
            assertThat(data.getHourlyDistribution()).hasSize(24);
        }

        @Test
        @DisplayName("topTools is limited to 10 entries")
        void topToolsLimitedToTen() {
            Instant ts = Instant.parse("2024-03-15T12:00:00Z");
            List<PersistentAuditEvent> events = new ArrayList<>();
            // 12 distinct tools, decreasing frequency so ordering is deterministic
            for (int i = 0; i < 12; i++) {
                for (int j = 0; j <= (12 - i); j++) {
                    events.add(
                            event(
                                    i * 100L + j,
                                    "alice",
                                    "T",
                                    ts,
                                    "{\"path\":\"/api/tool" + i + "\"}"));
                }
            }
            when(auditRepository.findByTimestampAfter(any())).thenReturn(events);
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(Collections.emptyList());

            AuditStatsData data = controller.getAuditStats("week").getBody();

            assertThat(data.getTopTools()).hasSize(10);
        }

        @Test
        @DisplayName("queries both current and previous period windows")
        void queriesCurrentAndPrevWindows() {
            when(auditRepository.findByTimestampAfter(any())).thenReturn(Collections.emptyList());
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());
            when(auditRepository.histogramByHourBetween(any(), any()))
                    .thenReturn(Collections.emptyList());

            controller.getAuditStats("month");

            verify(auditRepository).findByTimestampAfter(any());
            verify(auditRepository).findAllByTimestampBetweenForExport(any(), any());
            verify(auditRepository).histogramByHourBetween(any(), any());
        }
    }

    // ============================================================
    // exportAuditData
    // ============================================================

    @Nested
    @DisplayName("exportAuditData")
    class ExportAuditData {

        @Test
        @DisplayName("default csv with no fields -> technical header and rows")
        void defaultCsv() {
            Instant ts = Instant.parse("2024-01-01T10:00:00Z");
            PersistentAuditEvent e = event(1L, "alice", "USER_LOGIN", ts, "{\"x\":1}");
            when(auditRepository.findAll()).thenReturn(List.of(e));

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData("csv", null, null, null, null, null);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            String csv = new String(resp.getBody(), StandardCharsets.UTF_8);
            assertThat(csv).startsWith("ID,Principal,Type,Timestamp,Data\n");
            assertThat(csv).contains("alice");
            assertThat(csv).contains("USER_LOGIN");
            HttpHeaders headers = resp.getHeaders();
            assertThat(headers.getContentType().toString()).contains("text/csv");
            assertThat(headers.getContentDisposition().getFilename()).isEqualTo("audit_export.csv");
        }

        @Test
        @DisplayName("csv with selected fields builds custom header in canonical order")
        void csvSelectedFields() {
            Instant ts = Instant.parse("2024-01-01T10:00:00Z");
            String data =
                    "{\"clientIp\":\"1.2.3.4\",\"outcome\":\"success\",\"path\":\"/api/merge\","
                            + "\"files\":[{\"name\":\"doc.pdf\",\"pdfAuthor\":\"Bob\",\"fileHash\":\"abc\"}]}";
            PersistentAuditEvent e = event(1L, "alice", "PDF_PROCESS", ts, data);
            when(auditRepository.findAll()).thenReturn(List.of(e));

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData(
                            "csv",
                            "date,username,ipAddress,tool,documentName,outcome,author,fileHash,eventType",
                            null,
                            null,
                            null,
                            null);

            String csv = new String(resp.getBody(), StandardCharsets.UTF_8);
            String header = csv.split("\n")[0];
            assertThat(header)
                    .isEqualTo(
                            "Date,Username,IP Address,Tool,Document Name,Outcome,Author,File"
                                    + " Hash,Event Type");
            String row = csv.split("\n")[1];
            assertThat(row).contains("alice");
            assertThat(row).contains("1.2.3.4");
            assertThat(row).contains("merge");
            assertThat(row).contains("doc.pdf");
            assertThat(row).contains("Bob");
            assertThat(row).contains("abc");
            assertThat(row).contains("success");
            assertThat(row).contains("PDF_PROCESS");
            assertThat(resp.getHeaders().getContentDisposition().getFilename())
                    .startsWith("audit_export_");
        }

        @Test
        @DisplayName("blank/whitespace fields falls back to default csv")
        void blankFieldsFallsBackToDefault() {
            when(auditRepository.findAll()).thenReturn(Collections.emptyList());

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData("csv", "   ", null, null, null, null);

            String csv = new String(resp.getBody(), StandardCharsets.UTF_8);
            assertThat(csv).startsWith("ID,Principal,Type,Timestamp,Data\n");
            assertThat(resp.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("audit_export.csv");
        }

        @Test
        @DisplayName("json format -> serialized events with json disposition")
        void jsonFormat() {
            Instant ts = Instant.parse("2024-01-01T10:00:00Z");
            PersistentAuditEvent e = event(1L, "alice", "USER_LOGIN", ts, "{\"x\":1}");
            when(auditRepository.findAll()).thenReturn(List.of(e));

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData("json", null, null, null, null, null);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
            assertThat(resp.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("audit_export.json");
            String json = new String(resp.getBody(), StandardCharsets.UTF_8);
            assertThat(json).contains("alice");
            assertThat(json).contains("USER_LOGIN");
        }

        @Test
        @DisplayName("json format is case-insensitive")
        void jsonFormatCaseInsensitive() {
            when(auditRepository.findAll()).thenReturn(Collections.emptyList());

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData("JSON", null, null, null, null, null);

            assertThat(resp.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
        }

        @Test
        @DisplayName("csv escaping wraps values and doubles embedded quotes")
        void csvEscaping() {
            Instant ts = Instant.parse("2024-01-01T10:00:00Z");
            PersistentAuditEvent e = event(1L, "a\"b", "USER_LOGIN", ts, null);
            when(auditRepository.findAll()).thenReturn(List.of(e));

            String csv =
                    new String(
                            controller
                                    .exportAuditData("csv", null, null, null, null, null)
                                    .getBody(),
                            StandardCharsets.UTF_8);

            // escapeCSV wraps in quotes and doubles inner quotes
            assertThat(csv).contains("\"a\"\"b\"");
        }

        @Test
        @DisplayName("export with eventType filter -> findByTypeInForExport")
        void exportEventTypeFilter() {
            when(auditRepository.findByTypeInForExport(anyList()))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData("csv", null, new String[] {"USER_LOGIN"}, null, null, null);

            verify(auditRepository).findByTypeInForExport(eq(List.of("USER_LOGIN")));
            verify(auditRepository, never()).findAll();
        }

        @Test
        @DisplayName("export with username filter -> findByPrincipalInForExport")
        void exportUsernameFilter() {
            when(auditRepository.findByPrincipalInForExport(anyList()))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData("csv", null, null, new String[] {"alice"}, null, null);

            verify(auditRepository).findByPrincipalInForExport(eq(List.of("alice")));
        }

        @Test
        @DisplayName("export with date range only -> findAllByTimestampBetweenForExport")
        void exportDateRange() {
            when(auditRepository.findAllByTimestampBetweenForExport(any(), any()))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    "csv", null, null, null, LocalDate.of(2024, 1, 1), LocalDate.of(2024, 1, 31));

            verify(auditRepository).findAllByTimestampBetweenForExport(any(), any());
        }

        @Test
        @DisplayName("export with type + username -> findByTypeInAndPrincipalInForExport")
        void exportTypeAndUsername() {
            when(auditRepository.findByTypeInAndPrincipalInForExport(anyList(), anyList()))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    "csv", null, new String[] {"USER_LOGIN"}, new String[] {"alice"}, null, null);

            verify(auditRepository).findByTypeInAndPrincipalInForExport(anyList(), anyList());
        }

        @Test
        @DisplayName(
                "export with all filters -> findByTypeInAndPrincipalInAndTimestampBetweenForExport")
        void exportAllFilters() {
            when(auditRepository.findByTypeInAndPrincipalInAndTimestampBetweenForExport(
                            anyList(), anyList(), any(), any()))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    "csv",
                    null,
                    new String[] {"USER_LOGIN"},
                    new String[] {"alice"},
                    LocalDate.of(2024, 1, 1),
                    LocalDate.of(2024, 1, 31));

            verify(auditRepository)
                    .findByTypeInAndPrincipalInAndTimestampBetweenForExport(
                            anyList(), anyList(), any(), any());
        }

        @Test
        @DisplayName("export with type + date range -> findByTypeInAndTimestampBetweenForExport")
        void exportTypeAndDateRange() {
            when(auditRepository.findByTypeInAndTimestampBetweenForExport(anyList(), any(), any()))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    "csv",
                    null,
                    new String[] {"USER_LOGIN"},
                    null,
                    LocalDate.of(2024, 1, 1),
                    LocalDate.of(2024, 1, 31));

            verify(auditRepository)
                    .findByTypeInAndTimestampBetweenForExport(anyList(), any(), any());
        }

        @Test
        @DisplayName(
                "export with username + date range -> findByPrincipalInAndTimestampBetweenForExport")
        void exportUsernameAndDateRange() {
            when(auditRepository.findByPrincipalInAndTimestampBetweenForExport(
                            anyList(), any(), any()))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    "csv",
                    null,
                    null,
                    new String[] {"alice"},
                    LocalDate.of(2024, 1, 1),
                    LocalDate.of(2024, 1, 31));

            verify(auditRepository)
                    .findByPrincipalInAndTimestampBetweenForExport(anyList(), any(), any());
        }

        @Test
        @DisplayName("default format param csv still selected when explicitly passed")
        void unknownFormatTreatedAsCsv() {
            when(auditRepository.findAll()).thenReturn(Collections.emptyList());

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData("xml", null, null, null, null, null);

            // anything not "json" goes to CSV branch
            assertThat(resp.getHeaders().getContentType().toString()).contains("text/csv");
        }
    }

    // ============================================================
    // clearAllAuditData
    // ============================================================

    @Nested
    @DisplayName("clearAllAuditData")
    class ClearAll {

        @Test
        @DisplayName("success -> deleteAll called and 200 with message")
        void success() {
            ResponseEntity<?> resp = controller.clearAllAuditData();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(auditRepository).deleteAll();
            assertThat(resp.getBody()).isInstanceOf(Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> body = (Map<String, Object>) resp.getBody();
            assertThat(body.get("message"))
                    .isEqualTo("All audit data has been cleared successfully");
        }

        @Test
        @DisplayName("repository failure -> 500 with error message, not propagated")
        void failure() {
            org.mockito.Mockito.doThrow(new RuntimeException("db down"))
                    .when(auditRepository)
                    .deleteAll();

            ResponseEntity<?> resp = controller.clearAllAuditData();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(resp.getBody().toString()).contains("Failed to clear audit data");
            assertThat(resp.getBody().toString()).contains("db down");
        }
    }
}
