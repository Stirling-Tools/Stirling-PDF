package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

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
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.model.api.audit.AuditDataRequest;
import stirling.software.proprietary.model.api.audit.AuditDataResponse;
import stirling.software.proprietary.model.api.audit.AuditExportRequest;
import stirling.software.proprietary.model.api.audit.AuditStatsResponse;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuditDashboardControllerTest {

    @Mock private PersistentAuditEventRepository auditRepository;
    @Mock private ObjectMapper objectMapper;

    private AuditDashboardController controller;

    /** Concrete JacksonException subtype: needed because JacksonException ctors are protected. */
    static class TestJacksonException extends JacksonException {
        TestJacksonException(String message) {
            super(message);
        }
    }

    private static PersistentAuditEvent event(
            long id, String principal, String type, String data, Instant timestamp) {
        return PersistentAuditEvent.builder()
                .id(id)
                .principal(principal)
                .type(type)
                .data(data)
                .timestamp(timestamp)
                .build();
    }

    private AuditDataRequest dataRequest(
            String type, String principal, LocalDate start, LocalDate end, int page, int size) {
        AuditDataRequest request = new AuditDataRequest();
        request.setType(type);
        request.setPrincipal(principal);
        request.setStartDate(start);
        request.setEndDate(end);
        request.setPage(page);
        request.setSize(size);
        return request;
    }

    private AuditExportRequest exportRequest(
            String type, String principal, LocalDate start, LocalDate end) {
        AuditExportRequest request = new AuditExportRequest();
        request.setType(type);
        request.setPrincipal(principal);
        request.setStartDate(start);
        request.setEndDate(end);
        return request;
    }

    private Page<PersistentAuditEvent> pageOf(List<PersistentAuditEvent> content) {
        return new PageImpl<>(content, PageRequest.of(0, 30), content.size());
    }

    private void init() {
        controller = new AuditDashboardController(auditRepository, objectMapper);
    }

    @Nested
    @DisplayName("getAuditData filter routing")
    class GetAuditData {

        @Test
        @DisplayName("no filters -> findAll(pageable)")
        void noFilters() {
            init();
            PersistentAuditEvent e = event(1L, "admin", "USER_LOGIN", "{}", Instant.now());
            Page<PersistentAuditEvent> page =
                    new PageImpl<>(List.of(e), PageRequest.of(2, 15), 100);
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page);

            AuditDataResponse response =
                    controller.getAuditData(dataRequest(null, null, null, null, 2, 15));

            assertEquals(List.of(e), response.getContent());
            assertEquals(page.getTotalPages(), response.getTotalPages());
            assertEquals(100L, response.getTotalElements());
            assertEquals(2, response.getCurrentPage());
            verify(auditRepository).findAll(any(Pageable.class));
        }

        @Test
        @DisplayName("page/size/sort propagated to PageRequest")
        void pageableConstruction() {
            init();
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(pageOf(List.of()));

            controller.getAuditData(dataRequest(null, null, null, null, 3, 25));

            ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
            verify(auditRepository).findAll(captor.capture());
            Pageable pageable = captor.getValue();
            assertEquals(3, pageable.getPageNumber());
            assertEquals(25, pageable.getPageSize());
            assertNotNull(pageable.getSort().getOrderFor("timestamp"));
            assertTrue(pageable.getSort().getOrderFor("timestamp").isDescending());
        }

        @Test
        @DisplayName("type only -> findByType")
        void typeOnly() {
            init();
            when(auditRepository.findByType(eq("USER_LOGIN"), any(Pageable.class)))
                    .thenReturn(pageOf(List.of()));

            controller.getAuditData(dataRequest("USER_LOGIN", null, null, null, 0, 30));

            verify(auditRepository).findByType(eq("USER_LOGIN"), any(Pageable.class));
            verify(auditRepository, never()).findAll(any(Pageable.class));
        }

        @Test
        @DisplayName("principal only -> findByPrincipal")
        void principalOnly() {
            init();
            when(auditRepository.findByPrincipal(eq("admin"), any(Pageable.class)))
                    .thenReturn(pageOf(List.of()));

            controller.getAuditData(dataRequest(null, "admin", null, null, 0, 30));

            verify(auditRepository).findByPrincipal(eq("admin"), any(Pageable.class));
        }

        @Test
        @DisplayName("type + principal -> findByPrincipalAndType")
        void typeAndPrincipal() {
            init();
            when(auditRepository.findByPrincipalAndType(
                            eq("admin"), eq("USER_LOGIN"), any(Pageable.class)))
                    .thenReturn(pageOf(List.of()));

            controller.getAuditData(dataRequest("USER_LOGIN", "admin", null, null, 0, 30));

            verify(auditRepository)
                    .findByPrincipalAndType(eq("admin"), eq("USER_LOGIN"), any(Pageable.class));
        }

        @Test
        @DisplayName("date range only -> findByTimestampBetween with [start, end+1day)")
        void dateRangeOnly() {
            init();
            when(auditRepository.findByTimestampBetween(
                            any(Instant.class), any(Instant.class), any(Pageable.class)))
                    .thenReturn(pageOf(List.of()));

            LocalDate start = LocalDate.of(2025, 1, 1);
            LocalDate end = LocalDate.of(2025, 1, 31);
            controller.getAuditData(dataRequest(null, null, start, end, 0, 30));

            ArgumentCaptor<Instant> startCap = ArgumentCaptor.forClass(Instant.class);
            ArgumentCaptor<Instant> endCap = ArgumentCaptor.forClass(Instant.class);
            verify(auditRepository)
                    .findByTimestampBetween(
                            startCap.capture(), endCap.capture(), any(Pageable.class));
            assertEquals(
                    start.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant(),
                    startCap.getValue());
            assertEquals(
                    end.plusDays(1).atStartOfDay(java.time.ZoneId.systemDefault()).toInstant(),
                    endCap.getValue());
        }

        @Test
        @DisplayName("type + date range -> findByTypeAndTimestampBetween")
        void typeAndDateRange() {
            init();
            when(auditRepository.findByTypeAndTimestampBetween(
                            eq("PDF_PROCESS"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class)))
                    .thenReturn(pageOf(List.of()));

            controller.getAuditData(
                    dataRequest(
                            "PDF_PROCESS",
                            null,
                            LocalDate.of(2025, 2, 1),
                            LocalDate.of(2025, 2, 2),
                            0,
                            30));

            verify(auditRepository)
                    .findByTypeAndTimestampBetween(
                            eq("PDF_PROCESS"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class));
        }

        @Test
        @DisplayName("principal + date range -> findByPrincipalAndTimestampBetween")
        void principalAndDateRange() {
            init();
            when(auditRepository.findByPrincipalAndTimestampBetween(
                            eq("bob"), any(Instant.class), any(Instant.class), any(Pageable.class)))
                    .thenReturn(pageOf(List.of()));

            controller.getAuditData(
                    dataRequest(
                            null,
                            "bob",
                            LocalDate.of(2025, 3, 1),
                            LocalDate.of(2025, 3, 5),
                            0,
                            30));

            verify(auditRepository)
                    .findByPrincipalAndTimestampBetween(
                            eq("bob"), any(Instant.class), any(Instant.class), any(Pageable.class));
        }

        @Test
        @DisplayName("all filters -> findByPrincipalAndTypeAndTimestampBetween")
        void allFilters() {
            init();
            when(auditRepository.findByPrincipalAndTypeAndTimestampBetween(
                            eq("admin"),
                            eq("HTTP_REQUEST"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class)))
                    .thenReturn(pageOf(List.of()));

            controller.getAuditData(
                    dataRequest(
                            "HTTP_REQUEST",
                            "admin",
                            LocalDate.of(2025, 4, 1),
                            LocalDate.of(2025, 4, 30),
                            0,
                            30));

            verify(auditRepository)
                    .findByPrincipalAndTypeAndTimestampBetween(
                            eq("admin"),
                            eq("HTTP_REQUEST"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class));
        }

        @Test
        @DisplayName("partial date range (only startDate) ignored -> falls through to type branch")
        void onlyStartDateIgnored() {
            init();
            when(auditRepository.findByType(eq("USER_LOGIN"), any(Pageable.class)))
                    .thenReturn(pageOf(List.of()));

            // startDate set but endDate null -> date-range branches don't fire; type wins
            controller.getAuditData(
                    dataRequest("USER_LOGIN", null, LocalDate.of(2025, 1, 1), null, 0, 30));

            verify(auditRepository).findByType(eq("USER_LOGIN"), any(Pageable.class));
            verify(auditRepository, never())
                    .findByTypeAndTimestampBetween(
                            any(), any(Instant.class), any(Instant.class), any(Pageable.class));
        }

        @Test
        @DisplayName("response maps Page metadata even with content")
        void responseMetadataMapping() {
            init();
            PersistentAuditEvent a = event(1L, "u1", "USER_LOGIN", "{}", Instant.now());
            PersistentAuditEvent b = event(2L, "u2", "USER_LOGOUT", "{}", Instant.now());
            Page<PersistentAuditEvent> page =
                    new PageImpl<>(List.of(a, b), PageRequest.of(1, 2), 6);
            when(auditRepository.findAll(any(Pageable.class))).thenReturn(page);

            AuditDataResponse response =
                    controller.getAuditData(dataRequest(null, null, null, null, 1, 2));

            assertEquals(2, response.getContent().size());
            assertEquals(3, response.getTotalPages());
            assertEquals(6L, response.getTotalElements());
            assertEquals(1, response.getCurrentPage());
        }
    }

    @Nested
    @DisplayName("getAuditStats")
    class GetAuditStats {

        @Test
        @DisplayName("groups events by type, principal, and day")
        void groupsCorrectly() {
            init();
            Instant t1 =
                    LocalDate.of(2025, 5, 10)
                            .atStartOfDay(java.time.ZoneId.systemDefault())
                            .toInstant();
            Instant t2 =
                    LocalDate.of(2025, 5, 11)
                            .atStartOfDay(java.time.ZoneId.systemDefault())
                            .toInstant();
            List<PersistentAuditEvent> events =
                    List.of(
                            event(1L, "admin", "USER_LOGIN", "{}", t1),
                            event(2L, "admin", "USER_LOGIN", "{}", t1),
                            event(3L, "bob", "PDF_PROCESS", "{}", t2));
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(events);

            AuditStatsResponse stats = controller.getAuditStats(7);

            assertEquals(3, stats.getTotalEvents());
            assertEquals(2L, stats.getEventsByType().get("USER_LOGIN"));
            assertEquals(1L, stats.getEventsByType().get("PDF_PROCESS"));
            assertEquals(2L, stats.getEventsByPrincipal().get("admin"));
            assertEquals(1L, stats.getEventsByPrincipal().get("bob"));
            assertEquals(2, stats.getEventsByDay().size());
        }

        @Test
        @DisplayName("empty repository result yields zeroed stats")
        void emptyEvents() {
            init();
            when(auditRepository.findByTimestampAfter(any(Instant.class)))
                    .thenReturn(Collections.emptyList());

            AuditStatsResponse stats = controller.getAuditStats(30);

            assertEquals(0, stats.getTotalEvents());
            assertTrue(stats.getEventsByType().isEmpty());
            assertTrue(stats.getEventsByPrincipal().isEmpty());
            assertTrue(stats.getEventsByDay().isEmpty());
        }

        @Test
        @DisplayName("days param controls the lookback cutoff instant")
        void lookbackCutoff() {
            init();
            when(auditRepository.findByTimestampAfter(any(Instant.class)))
                    .thenReturn(Collections.emptyList());

            Instant before = Instant.now().minus(java.time.Duration.ofDays(7));
            controller.getAuditStats(7);
            Instant after = Instant.now().minus(java.time.Duration.ofDays(7));

            ArgumentCaptor<Instant> captor = ArgumentCaptor.forClass(Instant.class);
            verify(auditRepository).findByTimestampAfter(captor.capture());
            Instant cutoff = captor.getValue();
            // cutoff should be ~now-7d, between the two bounds we measured.
            assertFalse(cutoff.isBefore(before.minusSeconds(5)));
            assertFalse(cutoff.isAfter(after.plusSeconds(5)));
        }
    }

    @Nested
    @DisplayName("getAuditTypes")
    class GetAuditTypes {

        @Test
        @DisplayName("merges DB types with enum types, dedupes and sorts")
        void mergeDedupeSort() {
            init();
            // CUSTOM_TYPE only in DB; USER_LOGIN overlaps with enum.
            when(auditRepository.findDistinctEventTypes())
                    .thenReturn(List.of("CUSTOM_TYPE", "USER_LOGIN"));

            List<String> result = controller.getAuditTypes();

            // every enum value present
            for (AuditEventType t : AuditEventType.values()) {
                assertTrue(result.contains(t.name()), "missing enum type " + t.name());
            }
            assertTrue(result.contains("CUSTOM_TYPE"));
            // sorted ascending
            List<String> sorted = result.stream().sorted().toList();
            assertEquals(sorted, result);
            // USER_LOGIN appears exactly once (dedupe)
            assertEquals(1, result.stream().filter("USER_LOGIN"::equals).count());
        }

        @Test
        @DisplayName("empty DB types still returns all enum types")
        void emptyDbTypes() {
            init();
            when(auditRepository.findDistinctEventTypes()).thenReturn(Collections.emptyList());

            List<String> result = controller.getAuditTypes();

            assertEquals(AuditEventType.values().length, result.size());
            List<String> expected =
                    Arrays.stream(AuditEventType.values()).map(Enum::name).sorted().toList();
            assertEquals(expected, result);
        }
    }

    @Nested
    @DisplayName("exportAuditData (CSV)")
    class ExportCsv {

        @Test
        @DisplayName("no filters -> findAll(); CSV header + rows; octet-stream attachment")
        void csvNoFilters() {
            init();
            Instant ts = Instant.parse("2025-01-01T00:00:00Z");
            PersistentAuditEvent e = event(7L, "admin", "USER_LOGIN", "{\"k\":\"v\"}", ts);
            when(auditRepository.findAll()).thenReturn(List.of(e));

            ResponseEntity<byte[]> response =
                    controller.exportAuditData(exportRequest(null, null, null, null));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(
                    MediaType.APPLICATION_OCTET_STREAM, response.getHeaders().getContentType());
            String disposition = response.getHeaders().getFirst("Content-Disposition");
            assertNotNull(disposition);
            assertTrue(disposition.contains("audit_export.csv"));

            String csv = new String(response.getBody(), StandardCharsets.UTF_8);
            assertTrue(csv.startsWith("ID,Principal,Type,Timestamp,Data\n"));
            assertTrue(csv.contains("7,"));
            assertTrue(csv.contains("\"admin\""));
            assertTrue(csv.contains("\"USER_LOGIN\""));
            assertTrue(csv.contains("2025-01-01T00:00:00Z"));
            // data contains quotes which must be doubled and wrapped
            assertTrue(csv.contains("\"{\"\"k\"\":\"\"v\"\"}\""));
        }

        @Test
        @DisplayName("null principal/type/data escaped to empty quoted/empty fields")
        void csvNullFieldsEscaped() {
            init();
            Instant ts = Instant.parse("2025-06-01T12:30:00Z");
            PersistentAuditEvent e = event(9L, null, null, null, ts);
            when(auditRepository.findAll()).thenReturn(List.of(e));

            ResponseEntity<byte[]> response =
                    controller.exportAuditData(exportRequest(null, null, null, null));

            String csv = new String(response.getBody(), StandardCharsets.UTF_8);
            // null principal/type -> empty string; row: 9,,,<ts>,\n
            assertTrue(csv.contains("9,,,2025-06-01T12:30:00Z,\n"));
        }

        @Test
        @DisplayName("empty events -> only header")
        void csvEmpty() {
            init();
            when(auditRepository.findAll()).thenReturn(Collections.emptyList());

            ResponseEntity<byte[]> response =
                    controller.exportAuditData(exportRequest(null, null, null, null));

            String csv = new String(response.getBody(), StandardCharsets.UTF_8);
            assertEquals("ID,Principal,Type,Timestamp,Data\n", csv);
        }

        @Test
        @DisplayName("type filter -> findByTypeForExport")
        void csvTypeFilter() {
            init();
            when(auditRepository.findByTypeForExport("USER_LOGIN"))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(exportRequest("USER_LOGIN", null, null, null));

            verify(auditRepository).findByTypeForExport("USER_LOGIN");
            verify(auditRepository, never()).findAll();
        }

        @Test
        @DisplayName("principal filter -> findAllByPrincipalForExport")
        void csvPrincipalFilter() {
            init();
            when(auditRepository.findAllByPrincipalForExport("admin"))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(exportRequest(null, "admin", null, null));

            verify(auditRepository).findAllByPrincipalForExport("admin");
        }

        @Test
        @DisplayName("type + principal -> findAllByPrincipalAndTypeForExport")
        void csvTypeAndPrincipal() {
            init();
            when(auditRepository.findAllByPrincipalAndTypeForExport("admin", "USER_LOGIN"))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(exportRequest("USER_LOGIN", "admin", null, null));

            verify(auditRepository).findAllByPrincipalAndTypeForExport("admin", "USER_LOGIN");
        }

        @Test
        @DisplayName("date range -> findAllByTimestampBetweenForExport")
        void csvDateRange() {
            init();
            when(auditRepository.findAllByTimestampBetweenForExport(
                            any(Instant.class), any(Instant.class)))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    exportRequest(null, null, LocalDate.of(2025, 1, 1), LocalDate.of(2025, 1, 2)));

            verify(auditRepository)
                    .findAllByTimestampBetweenForExport(any(Instant.class), any(Instant.class));
        }

        @Test
        @DisplayName("type + date range -> findAllByTypeAndTimestampBetweenForExport")
        void csvTypeAndDateRange() {
            init();
            when(auditRepository.findAllByTypeAndTimestampBetweenForExport(
                            eq("PDF_PROCESS"), any(Instant.class), any(Instant.class)))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    exportRequest(
                            "PDF_PROCESS",
                            null,
                            LocalDate.of(2025, 2, 1),
                            LocalDate.of(2025, 2, 2)));

            verify(auditRepository)
                    .findAllByTypeAndTimestampBetweenForExport(
                            eq("PDF_PROCESS"), any(Instant.class), any(Instant.class));
        }

        @Test
        @DisplayName("principal + date range -> findAllByPrincipalAndTimestampBetweenForExport")
        void csvPrincipalAndDateRange() {
            init();
            when(auditRepository.findAllByPrincipalAndTimestampBetweenForExport(
                            eq("bob"), any(Instant.class), any(Instant.class)))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    exportRequest(null, "bob", LocalDate.of(2025, 3, 1), LocalDate.of(2025, 3, 2)));

            verify(auditRepository)
                    .findAllByPrincipalAndTimestampBetweenForExport(
                            eq("bob"), any(Instant.class), any(Instant.class));
        }

        @Test
        @DisplayName("all filters -> findAllByPrincipalAndTypeAndTimestampBetweenForExport")
        void csvAllFilters() {
            init();
            when(auditRepository.findAllByPrincipalAndTypeAndTimestampBetweenForExport(
                            eq("admin"),
                            eq("HTTP_REQUEST"),
                            any(Instant.class),
                            any(Instant.class)))
                    .thenReturn(Collections.emptyList());

            controller.exportAuditData(
                    exportRequest(
                            "HTTP_REQUEST",
                            "admin",
                            LocalDate.of(2025, 4, 1),
                            LocalDate.of(2025, 4, 2)));

            verify(auditRepository)
                    .findAllByPrincipalAndTypeAndTimestampBetweenForExport(
                            eq("admin"),
                            eq("HTTP_REQUEST"),
                            any(Instant.class),
                            any(Instant.class));
        }
    }

    @Nested
    @DisplayName("exportAuditDataJson (JSON)")
    class ExportJson {

        @Test
        @DisplayName("serializes events; application/json attachment")
        void jsonSuccess() {
            init();
            PersistentAuditEvent e = event(1L, "admin", "USER_LOGIN", "{}", Instant.now());
            List<PersistentAuditEvent> events = List.of(e);
            when(auditRepository.findAll()).thenReturn(events);
            byte[] bytes = "[{}]".getBytes(StandardCharsets.UTF_8);
            when(objectMapper.writeValueAsBytes(events)).thenReturn(bytes);

            ResponseEntity<byte[]> response =
                    controller.exportAuditDataJson(exportRequest(null, null, null, null));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
            String disposition = response.getHeaders().getFirst("Content-Disposition");
            assertNotNull(disposition);
            assertTrue(disposition.contains("audit_export.json"));
            assertArrayEquals(bytes, response.getBody());
        }

        @Test
        @DisplayName("serialization failure -> 500 with no body")
        void jsonSerializationError() {
            init();
            List<PersistentAuditEvent> events = Collections.emptyList();
            when(auditRepository.findAll()).thenReturn(events);
            when(objectMapper.writeValueAsBytes(events))
                    .thenThrow(new TestJacksonException("boom"));

            ResponseEntity<byte[]> response =
                    controller.exportAuditDataJson(exportRequest(null, null, null, null));

            assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
            assertEquals(null, response.getBody());
        }

        @Test
        @DisplayName("json export reuses the same criteria routing (type filter)")
        void jsonReusesCriteriaRouting() {
            init();
            when(auditRepository.findByTypeForExport("USER_LOGOUT"))
                    .thenReturn(Collections.emptyList());
            when(objectMapper.writeValueAsBytes(any())).thenReturn(new byte[0]);

            controller.exportAuditDataJson(exportRequest("USER_LOGOUT", null, null, null));

            verify(auditRepository).findByTypeForExport("USER_LOGOUT");
        }
    }

    @Nested
    @DisplayName("cleanupBefore")
    class CleanupBefore {

        @Test
        @DisplayName("past date -> deletes and reports deleted count + cutoff date")
        void pastDateDeletes() {
            init();
            LocalDate date = LocalDate.now().minusDays(5);
            when(auditRepository.deleteByTimestampBefore(any(Instant.class))).thenReturn(42);

            Map<String, Object> result = controller.cleanupBefore(date);

            assertEquals(42, result.get("deleted"));
            assertEquals(date.toString(), result.get("cutoffDate"));
            ArgumentCaptor<Instant> captor = ArgumentCaptor.forClass(Instant.class);
            verify(auditRepository).deleteByTimestampBefore(captor.capture());
            assertEquals(
                    date.atStartOfDay(java.time.ZoneId.systemDefault()).toInstant(),
                    captor.getValue());
        }

        @Test
        @DisplayName("today's date is allowed (not after now)")
        void todayAllowed() {
            init();
            LocalDate today = LocalDate.now();
            when(auditRepository.deleteByTimestampBefore(any(Instant.class))).thenReturn(0);

            Map<String, Object> result = controller.cleanupBefore(today);

            assertEquals(0, result.get("deleted"));
            assertEquals(today.toString(), result.get("cutoffDate"));
            verify(auditRepository).deleteByTimestampBefore(any(Instant.class));
        }

        @Test
        @DisplayName("future date -> rejected, no deletion, error message")
        void futureDateRejected() {
            init();
            LocalDate future = LocalDate.now().plusDays(1);

            Map<String, Object> result = controller.cleanupBefore(future);

            assertTrue(result.containsKey("error"));
            assertFalse(result.containsKey("deleted"));
            verifyNoInteractions(auditRepository);
        }

        @Test
        @DisplayName("null date -> rejected with error, no deletion")
        void nullDateRejected() {
            init();

            Map<String, Object> result = controller.cleanupBefore(null);

            assertTrue(result.containsKey("error"));
            verifyNoInteractions(auditRepository);
        }
    }
}
