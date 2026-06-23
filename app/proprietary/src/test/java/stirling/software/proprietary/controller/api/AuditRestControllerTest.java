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
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.controller.api.AuditRestController.AuditChartsData;
import stirling.software.proprietary.controller.api.AuditRestController.AuditEventsResponse;
import stirling.software.proprietary.controller.api.AuditRestController.AuditStatsData;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class AuditRestControllerTest {

    @Mock private PersistentAuditEventRepository auditRepository;

    private ObjectMapper objectMapper;
    private AuditRestController controller;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
        controller = new AuditRestController(auditRepository, objectMapper);
    }

    private PersistentAuditEvent event(long id, String principal, String type, String data) {
        return PersistentAuditEvent.builder()
                .id(id)
                .principal(principal)
                .type(type)
                .data(data)
                .timestamp(Instant.parse("2025-01-01T10:15:30Z"))
                .build();
    }

    private Page<PersistentAuditEvent> page(List<PersistentAuditEvent> content) {
        return new PageImpl<>(content, PageRequest.of(0, 30), content.size());
    }

    @Nested
    @DisplayName("getAuditEvents filter routing")
    class GetAuditEvents {

        @Test
        @DisplayName("no filters falls through to findAll and builds paginated response")
        void noFilters() {
            when(auditRepository.findAll(any(Pageable.class)))
                    .thenReturn(page(List.of(event(1L, "admin", "USER_LOGIN", "{\"x\":1}"))));

            ResponseEntity<AuditEventsResponse> resp =
                    controller.getAuditEvents(0, 30, null, null, null, null);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            AuditEventsResponse body = resp.getBody();
            assertThat(body.getEvents()).hasSize(1);
            assertThat(body.getTotalEvents()).isEqualTo(1);
            assertThat(body.getPage()).isZero();
            assertThat(body.getPageSize()).isEqualTo(30);
        }

        @Test
        @DisplayName("empty arrays are treated as no filter")
        void emptyArraysIgnored() {
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page(List.of()));

            controller.getAuditEvents(0, 30, new String[0], new String[0], null, null);

            verify(auditRepository).findAll(any(Pageable.class));
        }

        @Test
        @DisplayName("eventType only routes to findByTypeIn")
        void eventTypeOnly() {
            when(auditRepository.findByTypeIn(anyList(), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(0, 30, new String[] {"USER_LOGIN"}, null, null, null);

            verify(auditRepository).findByTypeIn(eq(List.of("USER_LOGIN")), any(Pageable.class));
        }

        @Test
        @DisplayName("username only routes to findByPrincipalIn")
        void usernameOnly() {
            when(auditRepository.findByPrincipalIn(anyList(), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(0, 30, null, new String[] {"admin"}, null, null);

            verify(auditRepository).findByPrincipalIn(eq(List.of("admin")), any(Pageable.class));
        }

        @Test
        @DisplayName("type and username routes to findByTypeInAndPrincipalIn")
        void typeAndUsername() {
            when(auditRepository.findByTypeInAndPrincipalIn(
                            anyList(), anyList(), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0, 30, new String[] {"USER_LOGIN"}, new String[] {"admin"}, null, null);

            verify(auditRepository)
                    .findByTypeInAndPrincipalIn(anyList(), anyList(), any(Pageable.class));
        }

        @Test
        @DisplayName("date range only routes to findByTimestampBetween")
        void dateRangeOnly() {
            when(auditRepository.findByTimestampBetween(
                            any(Instant.class), any(Instant.class), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0, 30, null, null, LocalDate.of(2025, 1, 1), LocalDate.of(2025, 1, 31));

            verify(auditRepository)
                    .findByTimestampBetween(
                            any(Instant.class), any(Instant.class), any(Pageable.class));
        }

        @Test
        @DisplayName("type and date range routes to findByTypeInAndTimestampBetween")
        void typeAndDateRange() {
            when(auditRepository.findByTypeInAndTimestampBetween(
                            anyList(), any(Instant.class), any(Instant.class), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0,
                    30,
                    new String[] {"PDF_PROCESS"},
                    null,
                    LocalDate.of(2025, 1, 1),
                    LocalDate.of(2025, 1, 31));

            verify(auditRepository)
                    .findByTypeInAndTimestampBetween(
                            anyList(), any(Instant.class), any(Instant.class), any(Pageable.class));
        }

        @Test
        @DisplayName("username and date range routes to findByPrincipalInAndTimestampBetween")
        void usernameAndDateRange() {
            when(auditRepository.findByPrincipalInAndTimestampBetween(
                            anyList(), any(Instant.class), any(Instant.class), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0,
                    30,
                    null,
                    new String[] {"admin"},
                    LocalDate.of(2025, 1, 1),
                    LocalDate.of(2025, 1, 31));

            verify(auditRepository)
                    .findByPrincipalInAndTimestampBetween(
                            anyList(), any(Instant.class), any(Instant.class), any(Pageable.class));
        }

        @Test
        @DisplayName("all filters route to combined query")
        void allFilters() {
            when(auditRepository.findByTypeInAndPrincipalInAndTimestampBetween(
                            anyList(),
                            anyList(),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditEvents(
                    0,
                    30,
                    new String[] {"USER_LOGIN"},
                    new String[] {"admin"},
                    LocalDate.of(2025, 1, 1),
                    LocalDate.of(2025, 1, 31));

            verify(auditRepository)
                    .findByTypeInAndPrincipalInAndTimestampBetween(
                            anyList(),
                            anyList(),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class));
        }

        @Test
        @DisplayName("invalid json data is captured as rawData in dto details")
        void invalidJsonBecomesRawData() {
            when(auditRepository.findAll(any(Pageable.class)))
                    .thenReturn(page(List.of(event(1L, "admin", "USER_LOGIN", "not-json"))));

            ResponseEntity<AuditEventsResponse> resp =
                    controller.getAuditEvents(0, 30, null, null, null, null);

            var details = resp.getBody().getEvents().get(0).getDetails();
            assertThat(details).containsEntry("rawData", "not-json");
        }

        @Test
        @DisplayName("clientIp is extracted into dto ipAddress")
        void clientIpExtracted() {
            when(auditRepository.findAll(any(Pageable.class)))
                    .thenReturn(
                            page(
                                    List.of(
                                            event(
                                                    1L,
                                                    "admin",
                                                    "USER_LOGIN",
                                                    "{\"clientIp\":\"10.0.0.5\"}"))));

            ResponseEntity<AuditEventsResponse> resp =
                    controller.getAuditEvents(0, 30, null, null, null, null);

            assertThat(resp.getBody().getEvents().get(0).getIpAddress()).isEqualTo("10.0.0.5");
        }

        @Test
        @DisplayName("__ipAddress fallback is used when clientIp missing")
        void ipAddressFallback() {
            when(auditRepository.findAll(any(Pageable.class)))
                    .thenReturn(
                            page(
                                    List.of(
                                            event(
                                                    1L,
                                                    "admin",
                                                    "USER_LOGIN",
                                                    "{\"__ipAddress\":\"192.168.1.1\"}"))));

            ResponseEntity<AuditEventsResponse> resp =
                    controller.getAuditEvents(0, 30, null, null, null, null);

            assertThat(resp.getBody().getEvents().get(0).getIpAddress()).isEqualTo("192.168.1.1");
        }
    }

    @Nested
    @DisplayName("getAuditCharts period handling")
    class GetAuditCharts {

        @Test
        @DisplayName("groups events by type, user and day")
        void buildsChartData() {
            when(auditRepository.findByTimestampAfter(any(Instant.class)))
                    .thenReturn(
                            List.of(
                                    event(1L, "admin", "USER_LOGIN", null),
                                    event(2L, "admin", "USER_LOGIN", null),
                                    event(3L, "bob", "PDF_PROCESS", null)));

            ResponseEntity<AuditChartsData> resp = controller.getAuditCharts("week");

            AuditChartsData data = resp.getBody();
            assertThat(data.getEventsByType().getLabels()).contains("USER_LOGIN", "PDF_PROCESS");
            assertThat(data.getEventsByUser().getLabels()).contains("admin", "bob");
            assertThat(data.getEventsOverTime().getLabels()).contains("2025-01-01");
        }

        @Test
        @DisplayName("day and month periods resolve without error")
        void dayAndMonthPeriods() {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(List.of());

            assertThat(controller.getAuditCharts("day").getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(controller.getAuditCharts("month").getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(controller.getAuditCharts("unknown").getStatusCode())
                    .isEqualTo(HttpStatus.OK);
        }
    }

    @Nested
    @DisplayName("getEventTypes and getUsers")
    class TypesAndUsers {

        @Test
        @DisplayName("event types merge db and enum values sorted distinct")
        void eventTypesMerged() {
            when(auditRepository.findDistinctEventTypes()).thenReturn(List.of("CUSTOM"));

            ResponseEntity<List<String>> resp = controller.getEventTypes();

            assertThat(resp.getBody()).contains("CUSTOM", "USER_LOGIN");
            assertThat(resp.getBody()).isSorted();
            assertThat(resp.getBody()).doesNotHaveDuplicates();
        }

        @Test
        @DisplayName("users extracted and sorted from countByPrincipal rows")
        void usersExtracted() {
            when(auditRepository.countByPrincipal())
                    .thenReturn(List.of(new Object[] {"zoe", 3L}, new Object[] {"amy", 1L}));

            ResponseEntity<List<String>> resp = controller.getUsers();

            assertThat(resp.getBody()).containsExactly("amy", "zoe");
        }
    }

    @Nested
    @DisplayName("getAuditStats metric computation")
    class GetAuditStats {

        @Test
        @DisplayName("computes success rate, latency, error count and top items")
        void computesMetrics() {
            List<PersistentAuditEvent> current =
                    List.of(
                            event(
                                    1L,
                                    "admin",
                                    "PDF_PROCESS",
                                    "{\"status\":\"success\",\"latencyMs\":100,\"path\":\"/api/v1/merge\"}"),
                            event(
                                    2L,
                                    "admin",
                                    "PDF_PROCESS",
                                    "{\"status\":\"failure\",\"latencyMs\":200,\"path\":\"/api/v1/merge\"}"),
                            event(3L, "bob", "USER_LOGIN", "{\"statusCode\":500}"));
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(current);
            when(auditRepository.findAllByTimestampBetweenForExport(
                            any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());
            when(auditRepository.histogramByHourBetween(any(Instant.class), any(Instant.class)))
                    .thenReturn(List.<Object[]>of(new Object[] {10, 2L}));

            ResponseEntity<AuditStatsData> resp = controller.getAuditStats("week");

            AuditStatsData data = resp.getBody();
            assertThat(data.getTotalEvents()).isEqualTo(3);
            assertThat(data.getUniqueUsers()).isEqualTo(2);
            // 1 success out of 2 with explicit outcome
            assertThat(data.getSuccessRate()).isEqualTo(50.0);
            assertThat(data.getAvgLatencyMs()).isEqualTo(150.0);
            // 1 explicit failure + 1 statusCode>=400
            assertThat(data.getErrorCount()).isEqualTo(2);
            assertThat(data.getTopEventType()).isEqualTo("PDF_PROCESS");
            assertThat(data.getTopUser()).isEqualTo("admin");
            assertThat(data.getTopTools()).containsKey("merge");
            assertThat(data.getHourlyDistribution()).containsEntry("10", 2L);
            assertThat(data.getHourlyDistribution()).containsEntry("00", 0L);
        }

        @Test
        @DisplayName("string latency and statusCode values are parsed safely")
        void stringNumericValues() {
            when(auditRepository.findByTimestampAfter(any(Instant.class)))
                    .thenReturn(
                            List.of(
                                    event(
                                            1L,
                                            "admin",
                                            "PDF_PROCESS",
                                            "{\"latencyMs\":\"300\",\"statusCode\":\"404\"}")));
            when(auditRepository.findAllByTimestampBetweenForExport(
                            any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());
            when(auditRepository.histogramByHourBetween(any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());

            ResponseEntity<AuditStatsData> resp = controller.getAuditStats("month");

            assertThat(resp.getBody().getAvgLatencyMs()).isEqualTo(300.0);
            assertThat(resp.getBody().getErrorCount()).isEqualTo(1);
        }

        @Test
        @DisplayName("legacy outcome key counts toward success rate")
        void legacyOutcomeKey() {
            when(auditRepository.findByTimestampAfter(any(Instant.class)))
                    .thenReturn(
                            List.of(
                                    event(
                                            1L,
                                            "admin",
                                            "PDF_PROCESS",
                                            "{\"outcome\":\"success\"}")));
            when(auditRepository.findAllByTimestampBetweenForExport(
                            any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());
            when(auditRepository.histogramByHourBetween(any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());

            ResponseEntity<AuditStatsData> resp = controller.getAuditStats("day");

            assertThat(resp.getBody().getSuccessRate()).isEqualTo(100.0);
        }

        @Test
        @DisplayName("empty period yields default metrics")
        void emptyMetrics() {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(List.of());
            when(auditRepository.findAllByTimestampBetweenForExport(
                            any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());
            when(auditRepository.histogramByHourBetween(any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());

            ResponseEntity<AuditStatsData> resp = controller.getAuditStats("week");

            assertThat(resp.getBody().getTotalEvents()).isZero();
            assertThat(resp.getBody().getSuccessRate()).isZero();
            assertThat(resp.getBody().getHourlyDistribution()).hasSize(24);
        }
    }

    @Nested
    @DisplayName("exportAuditData CSV/JSON")
    class Export {

        @Test
        @DisplayName("default CSV (no fields) uses technical header")
        void defaultCsv() {
            when(auditRepository.findAll())
                    .thenReturn(List.of(event(1L, "admin", "USER_LOGIN", "{\"a\":1}")));

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData("csv", null, null, null, null, null);

            String csv = new String(resp.getBody(), StandardCharsets.UTF_8);
            assertThat(csv).startsWith("ID,Principal,Type,Timestamp,Data");
            assertThat(resp.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("audit_export.csv");
        }

        @Test
        @DisplayName("field-selected CSV builds custom header and extracts nested data")
        void fieldSelectedCsv() {
            String data =
                    "{\"path\":\"/api/v1/merge\",\"outcome\":\"success\","
                            + "\"clientIp\":\"1.2.3.4\",\"result\":\"ok\","
                            + "\"files\":[{\"name\":\"a.pdf\",\"pdfAuthor\":\"jo\",\"fileHash\":\"abc\"}]}";
            when(auditRepository.findAll())
                    .thenReturn(List.of(event(1L, "admin", "USER_LOGIN", data)));

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData(
                            "csv",
                            "date,username,ipaddress,tool,documentname,outcome,author,filehash,operationresults,eventtype",
                            null,
                            null,
                            null,
                            null);

            String csv = new String(resp.getBody(), StandardCharsets.UTF_8);
            assertThat(csv).contains("Date,Username,IP Address,Tool,Document Name");
            assertThat(csv).contains("merge");
            assertThat(csv).contains("a.pdf");
            assertThat(csv).contains("jo");
            assertThat(csv).contains("abc");
            assertThat(csv).contains("1.2.3.4");
            assertThat(resp.getHeaders().getContentDisposition().getFilename())
                    .startsWith("audit_export_");
        }

        @Test
        @DisplayName("json format returns json bytes")
        void jsonExport() {
            when(auditRepository.findAll())
                    .thenReturn(List.of(event(1L, "admin", "USER_LOGIN", null)));

            ResponseEntity<byte[]> resp =
                    controller.exportAuditData("json", null, null, null, null, null);

            String json = new String(resp.getBody(), StandardCharsets.UTF_8);
            assertThat(json).contains("\"principal\":\"admin\"");
            assertThat(resp.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("audit_export.json");
        }

        @Test
        @DisplayName("type-only export routes to findByTypeInForExport")
        void typeOnlyExport() {
            when(auditRepository.findByTypeInForExport(anyList())).thenReturn(List.of());

            controller.exportAuditData("csv", null, new String[] {"USER_LOGIN"}, null, null, null);

            verify(auditRepository).findByTypeInForExport(eq(List.of("USER_LOGIN")));
            verify(auditRepository, never()).findAll();
        }

        @Test
        @DisplayName("all-filter export routes to combined export query")
        void allFilterExport() {
            when(auditRepository.findByTypeInAndPrincipalInAndTimestampBetweenForExport(
                            anyList(), anyList(), any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());

            controller.exportAuditData(
                    "csv",
                    null,
                    new String[] {"USER_LOGIN"},
                    new String[] {"admin"},
                    LocalDate.of(2025, 1, 1),
                    LocalDate.of(2025, 1, 31));

            verify(auditRepository)
                    .findByTypeInAndPrincipalInAndTimestampBetweenForExport(
                            anyList(), anyList(), any(Instant.class), any(Instant.class));
        }
    }

    @Nested
    @DisplayName("clearAllAuditData")
    class ClearAll {

        @Test
        @DisplayName("success returns ok with message")
        void success() {
            ResponseEntity<?> resp = controller.clearAllAuditData();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(auditRepository).deleteAll();
        }

        @Test
        @DisplayName("repository failure returns 500")
        void failure() {
            org.mockito.Mockito.doThrow(new RuntimeException("boom"))
                    .when(auditRepository)
                    .deleteAll();

            ResponseEntity<?> resp = controller.clearAllAuditData();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
