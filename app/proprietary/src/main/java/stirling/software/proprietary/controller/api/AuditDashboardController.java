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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
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
@RequestMapping("/audit")
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

        String mode;

        String type = request.getType();
        String principal = request.getPrincipal();
        LocalDate startDate = request.getStartDate();
        LocalDate endDate = request.getEndDate();

        if (type != null && principal != null && startDate != null && endDate != null) {
            mode = "principal + type + startDate + endDate";
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findByPrincipalAndTypeAndTimestampBetween(
                            principal, type, start, end, pageable);
        } else if (type != null && principal != null) {
            mode = "principal + type";
            events = auditRepository.findByPrincipalAndType(principal, type, pageable);
        } else if (type != null && startDate != null && endDate != null) {
            mode = "type + startDate + endDate";
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findByTypeAndTimestampBetween(type, start, end, pageable);
        } else if (principal != null && startDate != null && endDate != null) {
            mode = "principal + startDate + endDate";
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findByPrincipalAndTimestampBetween(
                            principal, start, end, pageable);
        } else if (startDate != null && endDate != null) {
            mode = "startDate + endDate";
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findByTimestampBetween(start, end, pageable);
        } else if (type != null) {
            mode = "type";
            events = auditRepository.findByType(type, pageable);
        } else if (principal != null) {
            mode = "principal";
            events = auditRepository.findByPrincipal(principal, pageable);
        } else {
            mode = "all";
            events = auditRepository.findAll(pageable);
        }

        // Logging
        List<PersistentAuditEvent> content = events.getContent();

        return new AuditDataResponse(
                content, events.getTotalPages(), events.getTotalElements(), events.getNumber());
    }

    /** Get statistics for charts. */
    @GetMapping("/stats")
    @Operation(summary = "Get audit statistics")
    public AuditStatsResponse getAuditStats(
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
    @GetMapping("/export")
    @Operation(summary = "Export audit data as CSV")
    public ResponseEntity<byte[]> exportAuditData(@ParameterObject AuditExportRequest request) {

        String type = request.getType();
        String principal = request.getPrincipal();
        LocalDate startDate = request.getStartDate();
        LocalDate endDate = request.getEndDate();

        log.info(
                "Exporting audit data: type={}, principal={}, startDate={}, endDate={}",
                type,
                principal,
                startDate,
                endDate);

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

    /** Helper method to escape CSV fields. */
    private String escapeCSV(String field) {
        if (field == null) {
            return "";
        }
        // Replace double quotes with two double quotes and wrap in quotes
        return "\"" + field.replace("\"", "\"\"") + "\"";
    }
}
