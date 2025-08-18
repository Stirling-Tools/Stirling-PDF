package stirling.software.proprietary.controller.api;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.model.api.audit.AuditDataRequest;
import stirling.software.proprietary.model.api.audit.AuditDataResponse;
import stirling.software.proprietary.model.api.audit.AuditExportRequest;
import stirling.software.proprietary.model.api.audit.AuditStatsResponse;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;

/** REST endpoints for the audit dashboard. */
@Slf4j
@RestController
@RequestMapping("/api/v1/audit")
@PreAuthorize("hasRole('ROLE_ADMIN')")
@RequiredArgsConstructor
@EnterpriseEndpoint
@Tag(name = "Audit", description = "Only Enterprise - Audit related operations")
public class AuditDashboardController {

    private final PersistentAuditEventRepository auditRepository;
    private final ObjectMapper objectMapper;

    /** Get audit events data for the dashboard tables. */
    @GetMapping("/data")
    @Operation(summary = "Get audit events data")
    public AuditDataResponse getAuditData(@ParameterObject AuditDataRequest request) {

        Pageable pageable =
                PageRequest.of(
                        request.getPage(), request.getSize(), Sort.by("timestamp").descending());
        Page<PersistentAuditEvent> events;

        String type = request.getType();
        String principal = request.getPrincipal();
        LocalDate startDate = request.getStartDate();
        LocalDate endDate = request.getEndDate();

        if (type != null && principal != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findByPrincipalAndTypeAndTimestampBetween(
                            principal, type, start, end, pageable);
        } else if (type != null && principal != null) {
            events = auditRepository.findByPrincipalAndType(principal, type, pageable);
        } else if (type != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findByTypeAndTimestampBetween(type, start, end, pageable);
        } else if (principal != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findByPrincipalAndTimestampBetween(
                            principal, start, end, pageable);
        } else if (startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findByTimestampBetween(start, end, pageable);
        } else if (type != null) {
            events = auditRepository.findByType(type, pageable);
        } else if (principal != null) {
            events = auditRepository.findByPrincipal(principal, pageable);
        } else {
            events = auditRepository.findAll(pageable);
        }

        // Logging
        List<PersistentAuditEvent> content = events.getContent();

        return new AuditDataResponse(
                content, events.getTotalPages(), events.getTotalElements(), events.getNumber());
    }

    /** Get statistics for charts (last X days). Existing behavior preserved. */
    @GetMapping("/stats")
    @Operation(summary = "Get audit statistics for the last N days")
    public AuditStatsResponse getAuditStats(
        @Schema(description = "Number of days to look back for audit events", example = "7", required = true)
            @RequestParam(value = "days", defaultValue = "7") int days) {

        // Get events from the last X days
        Instant startDate = Instant.now().minus(java.time.Duration.ofDays(days));
        List<PersistentAuditEvent> events = auditRepository.findByTimestampAfter(startDate);

        // Count events by type
        Map<String, Long> eventsByType =
                events.stream()
                        .collect(
                                Collectors.groupingBy(
                                        PersistentAuditEvent::getType, Collectors.counting()));

        // Count events by principal
        Map<String, Long> eventsByPrincipal =
                events.stream()
                        .collect(
                                Collectors.groupingBy(
                                        PersistentAuditEvent::getPrincipal, Collectors.counting()));

        // Count events by day
        Map<String, Long> eventsByDay =
                events.stream()
                        .collect(
                                Collectors.groupingBy(
                                        e ->
                                                LocalDateTime.ofInstant(
                                                                e.getTimestamp(),
                                                                ZoneId.systemDefault())
                                                        .format(DateTimeFormatter.ISO_LOCAL_DATE),
                                        Collectors.counting()));

        return new AuditStatsResponse(eventsByType, eventsByPrincipal, eventsByDay, events.size());
    }

    // /** Advanced statistics using repository aggregations, with explicit date range. */
    // @GetMapping("/stats/range")
    // @Operation(summary = "Get audit statistics for a date range (aggregated in DB)")
    // public Map<String, Object> getAuditStatsRange(@ParameterObject AuditDateExportRequest
    // request) {

    //     LocalDate startDate = request.getStartDate();
    //     LocalDate endDate = request.getEndDate();
    //     Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
    //     Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();

    //     Map<String, Long> byType = toStringLongMap(auditRepository.countByTypeBetween(start,
    // end));
    //     Map<String, Long> byPrincipal =
    //             toStringLongMap(auditRepository.countByPrincipalBetween(start, end));

    //     Map<String, Long> byDay = new HashMap<>();
    //     for (Object[] row : auditRepository.histogramByDayBetween(start, end)) {
    //         int y = ((Number) row[0]).intValue();
    //         int m = ((Number) row[1]).intValue();
    //         int d = ((Number) row[2]).intValue();
    //         long count = ((Number) row[3]).longValue();
    //         String key = String.format("%04d-%02d-%02d", y, m, d);
    //         byDay.put(key, count);
    //     }

    //     Map<String, Long> byHour = new HashMap<>();
    //     for (Object[] row : auditRepository.histogramByHourBetween(start, end)) {
    //         int hour = ((Number) row[0]).intValue();
    //         long count = ((Number) row[1]).longValue();
    //         byHour.put(String.format("%02d:00", hour), count);
    //     }

    //     Map<String, Object> payload = new HashMap<>();
    //     payload.put("byType", byType);
    //     payload.put("byPrincipal", byPrincipal);
    //     payload.put("byDay", byDay);
    //     payload.put("byHour", byHour);
    //     return payload;
    // }

    /** Get all unique event types from the database for filtering. */
    @GetMapping("/types")
    @Operation(summary = "Get all unique audit event types")
    public List<String> getAuditTypes() {
        // Get distinct event types from the database
        List<String> dbTypes = auditRepository.findDistinctEventTypes();

        // Include standard enum types in case they're not in the database yet
        List<String> enumTypes =
                Arrays.stream(AuditEventType.values())
                        .map(AuditEventType::name)
                        .collect(Collectors.toList());

        // Combine both sources, remove duplicates, and sort
        Set<String> combinedTypes = new HashSet<>();
        combinedTypes.addAll(dbTypes);
        combinedTypes.addAll(enumTypes);

        return combinedTypes.stream().sorted().collect(Collectors.toList());
    }

    /** Export audit data as CSV. */
    @GetMapping("/export/csv")
    @Operation(summary = "Export audit data as CSV")
    public ResponseEntity<byte[]> exportAuditData(@ParameterObject AuditExportRequest request) {

        List<PersistentAuditEvent> events = getAuditEventsByCriteria(request);

        // Convert to CSV
        StringBuilder csv = new StringBuilder();
        csv.append("ID,Principal,Type,Timestamp,Data\n");

        DateTimeFormatter formatter = DateTimeFormatter.ISO_INSTANT;

        for (PersistentAuditEvent event : events) {
            csv.append(event.getId()).append(",");
            csv.append(escapeCSV(event.getPrincipal())).append(",");
            csv.append(escapeCSV(event.getType())).append(",");
            csv.append(formatter.format(event.getTimestamp())).append(",");
            csv.append(escapeCSV(event.getData())).append("\n");
        }

        byte[] csvBytes = csv.toString().getBytes();

        // Set up HTTP headers for download
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentDispositionFormData("attachment", "audit_export.csv");

        return ResponseEntity.ok().headers(headers).body(csvBytes);
    }

    /** Export audit data as JSON. */
    @GetMapping("/export/json")
    @Operation(summary = "Export audit data as JSON")
    public ResponseEntity<byte[]> exportAuditDataJson(@ParameterObject AuditExportRequest request) {

        List<PersistentAuditEvent> events = getAuditEventsByCriteria(request);

        // Convert to JSON
        try {
            byte[] jsonBytes = objectMapper.writeValueAsBytes(events);

            // Set up HTTP headers for download
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setContentDispositionFormData("attachment", "audit_export.json");

            return ResponseEntity.ok().headers(headers).body(jsonBytes);
        } catch (JsonProcessingException e) {
            log.error("Error serializing audit events to JSON", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    // /** Get all unique principals. */
    // @GetMapping("/principals")
    // @Operation(summary = "Get all distinct principals")
    // public List<String> getPrincipals() {
    //     return auditRepository.findDistinctPrincipals();
    // }

    // /** Get principals by event type. */
    // @GetMapping("/types/{type}/principals")
    // @Operation(summary = "Get distinct principals for a given type")
    // public List<String> getPrincipalsByType(@PathVariable("type") String type) {
    //     return auditRepository.findDistinctPrincipalsByType(type);
    // }

    // /** Latest helpers */
    // @GetMapping("/latest")
    // @Operation(summary = "Get the latest audit event, optionally filtered by type or principal")
    // public ResponseEntity<PersistentAuditEvent> getLatest(
    //         @RequestParam(value = "type", required = false) String type,
    //         @RequestParam(value = "principal", required = false) String principal) {
    //     if (type != null) {
    //         return auditRepository
    //                 .findTopByTypeOrderByTimestampDesc(type)
    //                 .map(ResponseEntity::ok)
    //                 .orElse(ResponseEntity.noContent().build());
    //     } else if (principal != null) {
    //         return auditRepository
    //                 .findTopByPrincipalOrderByTimestampDesc(principal)
    //                 .map(ResponseEntity::ok)
    //                 .orElse(ResponseEntity.noContent().build());
    //     }
    //     return auditRepository
    //             .findTopByOrderByTimestampDesc()
    //             .map(ResponseEntity::ok)
    //             .orElse(ResponseEntity.noContent().build());
    // }

    /** Cleanup endpoints data before a certain date */
    @DeleteMapping("/cleanup/before")
    @Operation(
            summary = "Cleanup audit events before a certain date",
            description = "Deletes all audit events before the specified date.")
    public Map<String, Object> cleanupBefore(
            @RequestParam(value = "date", required = true)
                    @Schema(
                            description = "The cutoff date for cleanup",
                            example = "2025-01-01",
                            format = "date")
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate date) {
        if (date != null && !date.isAfter(LocalDate.now())) {
            Instant cutoff = date.atStartOfDay(ZoneId.systemDefault()).toInstant();
            int deleted = auditRepository.deleteByTimestampBefore(cutoff);
            return Map.of("deleted", deleted, "cutoffDate", date.toString());
        }
        return Map.of(
                "error",
                "Invalid date format. Use ISO date format (YYYY-MM-DD). Date must be in the past.");
    }

    // // ===== Helpers =====

    // private Map<String, Long> toStringLongMap(List<Object[]> rows) {
    //     Map<String, Long> map = new HashMap<>();
    //     for (Object[] row : rows) {
    //         String key = String.valueOf(row[0]);
    //         long val = ((Number) row[1]).longValue();
    //         map.put(key, val);
    //     }
    //     return map;
    // }

    /** Helper method to escape CSV fields. */
    private String escapeCSV(String field) {
        if (field == null) {
            return "";
        }
        // Replace double quotes with two double quotes and wrap in quotes
        return "\"" + field.replace("\"", "\"\"") + "\"";
    }

    private List<PersistentAuditEvent> getAuditEventsByCriteria(AuditExportRequest request) {
        String type = request.getType();
        String principal = request.getPrincipal();
        LocalDate startDate = request.getStartDate();
        LocalDate endDate = request.getEndDate();

        // Get data with same filtering as getAuditData
        List<PersistentAuditEvent> events;

        if (type != null && principal != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findAllByPrincipalAndTypeAndTimestampBetweenForExport(
                            principal, type, start, end);
        } else if (type != null && principal != null) {
            events = auditRepository.findAllByPrincipalAndTypeForExport(principal, type);
        } else if (type != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findAllByTypeAndTimestampBetweenForExport(type, start, end);
        } else if (principal != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findAllByPrincipalAndTimestampBetweenForExport(
                            principal, start, end);
        } else if (startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findAllByTimestampBetweenForExport(start, end);
        } else if (type != null) {
            events = auditRepository.findByTypeForExport(type);
        } else if (principal != null) {
            events = auditRepository.findAllByPrincipalForExport(principal);
        } else {
            events = auditRepository.findAll();
        }
        return events;
    }
}
