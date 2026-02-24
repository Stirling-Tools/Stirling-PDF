package stirling.software.proprietary.controller.api;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/** REST API controller for audit data used by React frontend. */
@Slf4j
@ProprietaryUiDataApi
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@EnterpriseEndpoint
public class AuditRestController {

    private final PersistentAuditEventRepository auditRepository;
    private final ObjectMapper objectMapper;

    /**
     * Get audit events with pagination and filters. Maps to frontend's getEvents() call.
     *
     * @param page Page number (0-indexed)
     * @param pageSize Number of items per page
     * @param eventType Filter by event type
     * @param username Filter by username (principal)
     * @param startDate Filter start date
     * @param endDate Filter end date
     * @return Paginated audit events response
     */
    @GetMapping("/audit-events")
    public ResponseEntity<AuditEventsResponse> getAuditEvents(
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "30") int pageSize,
            @RequestParam(value = "eventType", required = false) String eventType,
            @RequestParam(value = "username", required = false) String username,
            @RequestParam(value = "startDate", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate startDate,
            @RequestParam(value = "endDate", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate endDate) {

        Pageable pageable = PageRequest.of(page, pageSize, Sort.by("timestamp").descending());
        Page<PersistentAuditEvent> events;

        // Apply filters based on provided parameters
        if (eventType != null && username != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findByPrincipalAndTypeAndTimestampBetween(
                            username, eventType, start, end, pageable);
        } else if (eventType != null && username != null) {
            events = auditRepository.findByPrincipalAndType(username, eventType, pageable);
        } else if (eventType != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findByTypeAndTimestampBetween(eventType, start, end, pageable);
        } else if (username != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findByPrincipalAndTimestampBetween(
                            username, start, end, pageable);
        } else if (startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findByTimestampBetween(start, end, pageable);
        } else if (eventType != null) {
            events = auditRepository.findByType(eventType, pageable);
        } else if (username != null) {
            events = auditRepository.findByPrincipal(username, pageable);
        } else {
            events = auditRepository.findAll(pageable);
        }

        // Convert to response format expected by frontend
        List<AuditEventDto> eventDtos =
                events.getContent().stream().map(this::convertToDto).collect(Collectors.toList());

        AuditEventsResponse response =
                AuditEventsResponse.builder()
                        .events(eventDtos)
                        .totalEvents((int) events.getTotalElements())
                        .page(events.getNumber())
                        .pageSize(events.getSize())
                        .totalPages(events.getTotalPages())
                        .build();

        return ResponseEntity.ok(response);
    }

    /**
     * Get chart data for dashboard. Maps to frontend's getChartsData() call.
     *
     * @param period Time period for charts (day/week/month)
     * @return Chart data for events by type, user, and over time
     */
    @GetMapping("/audit-charts")
    public ResponseEntity<AuditChartsData> getAuditCharts(
            @RequestParam(value = "period", defaultValue = "week") String period) {

        // Calculate days based on period
        int days;
        switch (period.toLowerCase()) {
            case "day":
                days = 1;
                break;
            case "month":
                days = 30;
                break;
            case "week":
            default:
                days = 7;
                break;
        }

        // Get events from the specified period
        Instant startDate = Instant.now().minus(java.time.Duration.ofDays(days));
        List<PersistentAuditEvent> events = auditRepository.findByTimestampAfter(startDate);

        // Count events by type
        Map<String, Long> eventsByType =
                events.stream()
                        .collect(
                                Collectors.groupingBy(
                                        PersistentAuditEvent::getType, Collectors.counting()));

        // Count events by principal (user)
        Map<String, Long> eventsByUser =
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

        // Convert to ChartData format
        ChartData eventsByTypeChart =
                ChartData.builder()
                        .labels(new ArrayList<>(eventsByType.keySet()))
                        .values(
                                eventsByType.values().stream()
                                        .map(Long::intValue)
                                        .collect(Collectors.toList()))
                        .build();

        ChartData eventsByUserChart =
                ChartData.builder()
                        .labels(new ArrayList<>(eventsByUser.keySet()))
                        .values(
                                eventsByUser.values().stream()
                                        .map(Long::intValue)
                                        .collect(Collectors.toList()))
                        .build();

        // Sort events by day for time series
        TreeMap<String, Long> sortedEventsByDay = new TreeMap<>(eventsByDay);
        ChartData eventsOverTimeChart =
                ChartData.builder()
                        .labels(new ArrayList<>(sortedEventsByDay.keySet()))
                        .values(
                                sortedEventsByDay.values().stream()
                                        .map(Long::intValue)
                                        .collect(Collectors.toList()))
                        .build();

        AuditChartsData chartsData =
                AuditChartsData.builder()
                        .eventsByType(eventsByTypeChart)
                        .eventsByUser(eventsByUserChart)
                        .eventsOverTime(eventsOverTimeChart)
                        .build();

        return ResponseEntity.ok(chartsData);
    }

    /**
     * Get available event types for filtering. Maps to frontend's getEventTypes() call.
     *
     * @return List of unique event types
     */
    @GetMapping("/audit-event-types")
    public ResponseEntity<List<String>> getEventTypes() {
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

        List<String> result = combinedTypes.stream().sorted().collect(Collectors.toList());

        return ResponseEntity.ok(result);
    }

    /**
     * Get list of users for filtering. Maps to frontend's getUsers() call.
     *
     * @return List of unique usernames
     */
    @GetMapping("/audit-users")
    public ResponseEntity<List<String>> getUsers() {
        // Use the countByPrincipal query to get unique principals
        List<Object[]> principalCounts = auditRepository.countByPrincipal();

        List<String> users =
                principalCounts.stream()
                        .map(arr -> (String) arr[0])
                        .sorted()
                        .collect(Collectors.toList());

        return ResponseEntity.ok(users);
    }

    /**
     * Export audit data in CSV or JSON format. Maps to frontend's exportData() call.
     *
     * @param format Export format (csv or json)
     * @param eventType Filter by event type
     * @param username Filter by username
     * @param startDate Filter start date
     * @param endDate Filter end date
     * @return File download response
     */
    @GetMapping("/audit-export")
    public ResponseEntity<byte[]> exportAuditData(
            @RequestParam(value = "format", defaultValue = "csv") String format,
            @RequestParam(value = "eventType", required = false) String eventType,
            @RequestParam(value = "username", required = false) String username,
            @RequestParam(value = "startDate", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate startDate,
            @RequestParam(value = "endDate", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate endDate) {

        // Get data with same filtering as getAuditEvents
        List<PersistentAuditEvent> events;

        if (eventType != null && username != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findAllByPrincipalAndTypeAndTimestampBetweenForExport(
                            username, eventType, start, end);
        } else if (eventType != null && username != null) {
            events = auditRepository.findAllByPrincipalAndTypeForExport(username, eventType);
        } else if (eventType != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findAllByTypeAndTimestampBetweenForExport(
                            eventType, start, end);
        } else if (username != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events =
                    auditRepository.findAllByPrincipalAndTimestampBetweenForExport(
                            username, start, end);
        } else if (startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            events = auditRepository.findAllByTimestampBetweenForExport(start, end);
        } else if (eventType != null) {
            events = auditRepository.findByTypeForExport(eventType);
        } else if (username != null) {
            events = auditRepository.findAllByPrincipalForExport(username);
        } else {
            events = auditRepository.findAll();
        }

        // Export based on format
        if ("json".equalsIgnoreCase(format)) {
            return exportAsJson(events);
        } else {
            return exportAsCsv(events);
        }
    }

    // Helper methods

    private AuditEventDto convertToDto(PersistentAuditEvent event) {
        // Parse the JSON data field if present
        Map<String, Object> details = new HashMap<>();
        if (event.getData() != null && !event.getData().isEmpty()) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = objectMapper.readValue(event.getData(), Map.class);
                details = parsed;
            } catch (JacksonException e) {
                log.warn("Failed to parse audit event data as JSON: {}", event.getData());
                details.put("rawData", event.getData());
            }
        }

        return AuditEventDto.builder()
                .id(String.valueOf(event.getId()))
                .timestamp(event.getTimestamp().toString())
                .eventType(event.getType())
                .username(event.getPrincipal())
                .ipAddress((String) details.getOrDefault("ipAddress", "")) // Extract if available
                .details(details)
                .build();
    }

    private ResponseEntity<byte[]> exportAsCsv(List<PersistentAuditEvent> events) {
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

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentDispositionFormData("attachment", "audit_export.csv");

        return ResponseEntity.ok().headers(headers).body(csvBytes);
    }

    private ResponseEntity<byte[]> exportAsJson(List<PersistentAuditEvent> events) {
        try {
            byte[] jsonBytes = objectMapper.writeValueAsBytes(events);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setContentDispositionFormData("attachment", "audit_export.json");

            return ResponseEntity.ok().headers(headers).body(jsonBytes);
        } catch (JacksonException e) {
            log.error("Error serializing audit events to JSON", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    private String escapeCSV(String field) {
        if (field == null) {
            return "";
        }
        // Replace double quotes with two double quotes and wrap in quotes
        return "\"" + field.replace("\"", "\"\"") + "\"";
    }

    // DTOs for response formatting

    @lombok.Data
    @lombok.Builder
    public static class AuditEventsResponse {
        private List<AuditEventDto> events;
        private int totalEvents;
        private int page;
        private int pageSize;
        private int totalPages;
    }

    @lombok.Data
    @lombok.Builder
    public static class AuditEventDto {
        private String id;
        private String timestamp;
        private String eventType;
        private String username;
        private String ipAddress;
        private Map<String, Object> details;
    }

    @lombok.Data
    @lombok.Builder
    public static class AuditChartsData {
        private ChartData eventsByType;
        private ChartData eventsByUser;
        private ChartData eventsOverTime;
    }

    @lombok.Data
    @lombok.Builder
    public static class ChartData {
        private List<String> labels;
        private List<Integer> values;
    }
}
