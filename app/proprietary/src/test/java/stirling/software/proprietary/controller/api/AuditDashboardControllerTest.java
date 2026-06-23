package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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

import stirling.software.proprietary.model.api.audit.AuditDataRequest;
import stirling.software.proprietary.model.api.audit.AuditDataResponse;
import stirling.software.proprietary.model.api.audit.AuditExportRequest;
import stirling.software.proprietary.model.api.audit.AuditStatsResponse;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class AuditDashboardControllerTest {

    @Mock private PersistentAuditEventRepository auditRepository;

    private ObjectMapper objectMapper;
    private AuditDashboardController controller;

    @BeforeEach
    void setUp() {
        objectMapper = JsonMapper.builder().build();
        controller = new AuditDashboardController(auditRepository, objectMapper);
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
    @DisplayName("getAuditData filter branches")
    class GetAuditData {

        @Test
        @DisplayName("no filters falls through to findAll")
        void noFilters() {
            AuditDataRequest req = new AuditDataRequest();
            when(auditRepository.findAll(any(Pageable.class)))
                    .thenReturn(page(List.of(event(1L, "admin", "USER_LOGIN", null))));

            AuditDataResponse resp = controller.getAuditData(req);

            assertThat(resp.getContent()).hasSize(1);
            assertThat(resp.getTotalElements()).isEqualTo(1L);
            assertThat(resp.getCurrentPage()).isZero();
        }

        @Test
        @DisplayName("type only routes to findByType")
        void typeOnly() {
            AuditDataRequest req = new AuditDataRequest();
            req.setType("USER_LOGIN");
            when(auditRepository.findByType(eq("USER_LOGIN"), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditData(req);

            verify(auditRepository).findByType(eq("USER_LOGIN"), any(Pageable.class));
        }

        @Test
        @DisplayName("principal only routes to findByPrincipal")
        void principalOnly() {
            AuditDataRequest req = new AuditDataRequest();
            req.setPrincipal("admin");
            when(auditRepository.findByPrincipal(eq("admin"), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditData(req);

            verify(auditRepository).findByPrincipal(eq("admin"), any(Pageable.class));
        }

        @Test
        @DisplayName("type and principal routes to findByPrincipalAndType")
        void typeAndPrincipal() {
            AuditDataRequest req = new AuditDataRequest();
            req.setType("USER_LOGIN");
            req.setPrincipal("admin");
            when(auditRepository.findByPrincipalAndType(
                            eq("admin"), eq("USER_LOGIN"), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditData(req);

            verify(auditRepository)
                    .findByPrincipalAndType(eq("admin"), eq("USER_LOGIN"), any(Pageable.class));
        }

        @Test
        @DisplayName("date range only routes to findByTimestampBetween")
        void dateRangeOnly() {
            AuditDataRequest req = new AuditDataRequest();
            req.setStartDate(LocalDate.of(2025, 1, 1));
            req.setEndDate(LocalDate.of(2025, 1, 31));
            when(auditRepository.findByTimestampBetween(
                            any(Instant.class), any(Instant.class), any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditData(req);

            verify(auditRepository)
                    .findByTimestampBetween(
                            any(Instant.class), any(Instant.class), any(Pageable.class));
        }

        @Test
        @DisplayName("type and date range routes to findByTypeAndTimestampBetween")
        void typeAndDateRange() {
            AuditDataRequest req = new AuditDataRequest();
            req.setType("PDF_PROCESS");
            req.setStartDate(LocalDate.of(2025, 1, 1));
            req.setEndDate(LocalDate.of(2025, 1, 31));
            when(auditRepository.findByTypeAndTimestampBetween(
                            eq("PDF_PROCESS"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditData(req);

            verify(auditRepository)
                    .findByTypeAndTimestampBetween(
                            eq("PDF_PROCESS"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class));
        }

        @Test
        @DisplayName("principal and date range routes to findByPrincipalAndTimestampBetween")
        void principalAndDateRange() {
            AuditDataRequest req = new AuditDataRequest();
            req.setPrincipal("admin");
            req.setStartDate(LocalDate.of(2025, 1, 1));
            req.setEndDate(LocalDate.of(2025, 1, 31));
            when(auditRepository.findByPrincipalAndTimestampBetween(
                            eq("admin"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditData(req);

            verify(auditRepository)
                    .findByPrincipalAndTimestampBetween(
                            eq("admin"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class));
        }

        @Test
        @DisplayName("all filters route to findByPrincipalAndTypeAndTimestampBetween")
        void allFilters() {
            AuditDataRequest req = new AuditDataRequest();
            req.setType("USER_LOGIN");
            req.setPrincipal("admin");
            req.setStartDate(LocalDate.of(2025, 1, 1));
            req.setEndDate(LocalDate.of(2025, 1, 31));
            when(auditRepository.findByPrincipalAndTypeAndTimestampBetween(
                            eq("admin"),
                            eq("USER_LOGIN"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class)))
                    .thenReturn(page(List.of()));

            controller.getAuditData(req);

            verify(auditRepository)
                    .findByPrincipalAndTypeAndTimestampBetween(
                            eq("admin"),
                            eq("USER_LOGIN"),
                            any(Instant.class),
                            any(Instant.class),
                            any(Pageable.class));
        }
    }

    @Nested
    @DisplayName("getAuditStats aggregation")
    class GetAuditStats {

        @Test
        @DisplayName("groups events by type, principal and day")
        void aggregatesCounts() {
            List<PersistentAuditEvent> events =
                    List.of(
                            event(1L, "admin", "USER_LOGIN", null),
                            event(2L, "admin", "USER_LOGIN", null),
                            event(3L, "bob", "PDF_PROCESS", null));
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(events);

            AuditStatsResponse resp = controller.getAuditStats(7);

            assertThat(resp.getTotalEvents()).isEqualTo(3);
            assertThat(resp.getEventsByType()).containsEntry("USER_LOGIN", 2L);
            assertThat(resp.getEventsByType()).containsEntry("PDF_PROCESS", 1L);
            assertThat(resp.getEventsByPrincipal()).containsEntry("admin", 2L);
            assertThat(resp.getEventsByDay()).containsEntry("2025-01-01", 3L);
        }

        @Test
        @DisplayName("empty result yields zero totals")
        void emptyResult() {
            when(auditRepository.findByTimestampAfter(any(Instant.class))).thenReturn(List.of());

            AuditStatsResponse resp = controller.getAuditStats(30);

            assertThat(resp.getTotalEvents()).isZero();
            assertThat(resp.getEventsByType()).isEmpty();
        }
    }

    @Nested
    @DisplayName("getAuditTypes")
    class GetAuditTypes {

        @Test
        @DisplayName("merges db types with enum types and sorts distinct")
        void mergesAndSorts() {
            when(auditRepository.findDistinctEventTypes())
                    .thenReturn(List.of("CUSTOM_TYPE", "USER_LOGIN"));

            List<String> types = controller.getAuditTypes();

            assertThat(types).contains("CUSTOM_TYPE", "USER_LOGIN", "PDF_PROCESS");
            assertThat(types).isSorted();
            assertThat(types).doesNotHaveDuplicates();
        }
    }

    @Nested
    @DisplayName("exportAuditData CSV")
    class ExportCsv {

        @Test
        @DisplayName("returns CSV with header and escaped rows")
        void csvWithRows() {
            AuditExportRequest req = new AuditExportRequest();
            when(auditRepository.findAll())
                    .thenReturn(List.of(event(1L, "ad\"min", "USER_LOGIN", "{\"a\":1}")));

            ResponseEntity<byte[]> resp = controller.exportAuditData(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            String csv = new String(resp.getBody(), StandardCharsets.UTF_8);
            assertThat(csv).startsWith("ID,Principal,Type,Timestamp,Data");
            // Quotes inside fields must be doubled
            assertThat(csv).contains("\"ad\"\"min\"");
            assertThat(resp.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("audit_export.csv");
        }

        @Test
        @DisplayName("type filter feeds findByTypeForExport")
        void csvWithTypeFilter() {
            AuditExportRequest req = new AuditExportRequest();
            req.setType("USER_LOGIN");
            when(auditRepository.findByTypeForExport("USER_LOGIN")).thenReturn(List.of());

            controller.exportAuditData(req);

            verify(auditRepository).findByTypeForExport("USER_LOGIN");
            verify(auditRepository, never()).findAll();
        }
    }

    @Nested
    @DisplayName("exportAuditDataJson")
    class ExportJson {

        @Test
        @DisplayName("returns JSON body and attachment header")
        void jsonExport() {
            AuditExportRequest req = new AuditExportRequest();
            when(auditRepository.findAll())
                    .thenReturn(List.of(event(1L, "admin", "USER_LOGIN", null)));

            ResponseEntity<byte[]> resp = controller.exportAuditDataJson(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            String json = new String(resp.getBody(), StandardCharsets.UTF_8);
            assertThat(json).contains("\"principal\":\"admin\"");
            assertThat(resp.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("audit_export.json");
        }

        @Test
        @DisplayName("all-filter export routes to combined-criteria query")
        void jsonExportAllFilters() {
            AuditExportRequest req = new AuditExportRequest();
            req.setType("USER_LOGIN");
            req.setPrincipal("admin");
            req.setStartDate(LocalDate.of(2025, 1, 1));
            req.setEndDate(LocalDate.of(2025, 1, 31));
            when(auditRepository.findAllByPrincipalAndTypeAndTimestampBetweenForExport(
                            eq("admin"), eq("USER_LOGIN"), any(Instant.class), any(Instant.class)))
                    .thenReturn(List.of());

            controller.exportAuditDataJson(req);

            verify(auditRepository)
                    .findAllByPrincipalAndTypeAndTimestampBetweenForExport(
                            eq("admin"), eq("USER_LOGIN"), any(Instant.class), any(Instant.class));
        }
    }

    @Nested
    @DisplayName("cleanupBefore")
    class CleanupBefore {

        @Test
        @DisplayName("past date deletes and returns count")
        void pastDateDeletes() {
            LocalDate cutoff = LocalDate.now().minusDays(1);
            when(auditRepository.deleteByTimestampBefore(any(Instant.class))).thenReturn(5);

            var result = controller.cleanupBefore(cutoff);

            assertThat(result).containsEntry("deleted", 5);
            assertThat(result).containsEntry("cutoffDate", cutoff.toString());
        }

        @Test
        @DisplayName("future date is rejected without delete")
        void futureDateRejected() {
            LocalDate future = LocalDate.now().plusDays(1);

            var result = controller.cleanupBefore(future);

            assertThat(result).containsKey("error");
            verify(auditRepository, never()).deleteByTimestampBefore(any(Instant.class));
        }
    }

    @Test
    @DisplayName("escapeCSV null becomes empty string via default export path")
    void csvHandlesNullData() {
        AuditExportRequest req = new AuditExportRequest();
        when(auditRepository.findAll()).thenReturn(List.of(event(1L, "admin", "USER_LOGIN", null)));

        ResponseEntity<byte[]> resp = controller.exportAuditData(req);

        String csv = new String(resp.getBody(), StandardCharsets.UTF_8);
        // Null data field renders as empty quoted field
        assertThat(csv).contains("\"USER_LOGIN\"");
        assertThat(csv).contains("admin");
        verify(auditRepository).findAll();
    }
}
