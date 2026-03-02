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
import org.springframework.web.bind.annotation.PostMapping;
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
     * Get audit events with pagination and filters. Maps to frontend's getEvents() call. Supports
     * both single values and multi-select arrays for eventType and username.
     *
     * @param page Page number (0-indexed)
     * @param pageSize Number of items per page
     * @param eventType Filter by event type(s) - can be single value or array
     * @param username Filter by username(s) - can be single value or array
     * @param startDate Filter start date
     * @param endDate Filter end date
     * @return Paginated audit events response
     */
    @GetMapping("/audit-events")
    public ResponseEntity<AuditEventsResponse> getAuditEvents(
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "30") int pageSize,
            @RequestParam(value = "eventType", required = false) String[] eventTypes,
            @RequestParam(value = "username", required = false) String[] usernames,
            @RequestParam(value = "startDate", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate startDate,
            @RequestParam(value = "endDate", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate endDate) {

        Pageable pageable = PageRequest.of(page, pageSize, Sort.by("timestamp").descending());
        Page<PersistentAuditEvent> events;

        // Convert arrays to lists
        List<String> eventTypeList =
                (eventTypes != null && eventTypes.length > 0) ? Arrays.asList(eventTypes) : null;
        List<String> usernameList =
                (usernames != null && usernames.length > 0) ? Arrays.asList(usernames) : null;

        Instant startInstant = null;
        Instant endInstant = null;
        if (startDate != null && endDate != null) {
            startInstant = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            endInstant = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
        }

        // Apply filters based on provided parameters
        if (eventTypeList != null
                && usernameList != null
                && startInstant != null
                && endInstant != null) {
            events =
                    auditRepository.findByTypeInAndPrincipalInAndTimestampBetween(
                            eventTypeList, usernameList, startInstant, endInstant, pageable);
        } else if (eventTypeList != null && usernameList != null) {
            events =
                    auditRepository.findByTypeInAndPrincipalIn(
                            eventTypeList, usernameList, pageable);
        } else if (eventTypeList != null && startInstant != null && endInstant != null) {
            events =
                    auditRepository.findByTypeInAndTimestampBetween(
                            eventTypeList, startInstant, endInstant, pageable);
        } else if (usernameList != null && startInstant != null && endInstant != null) {
            events =
                    auditRepository.findByPrincipalInAndTimestampBetween(
                            usernameList, startInstant, endInstant, pageable);
        } else if (startInstant != null && endInstant != null) {
            events = auditRepository.findByTimestampBetween(startInstant, endInstant, pageable);
        } else if (eventTypeList != null) {
            events = auditRepository.findByTypeIn(eventTypeList, pageable);
        } else if (usernameList != null) {
            events = auditRepository.findByPrincipalIn(usernameList, pageable);
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
     * Get audit statistics for KPI dashboard. Includes success rates, latency metrics, and top
     * items.
     *
     * @param period Time period for statistics (day/week/month)
     * @return Audit statistics data for dashboard KPI cards and enhanced charts
     */
    @GetMapping("/audit-stats")
    public ResponseEntity<AuditStatsData> getAuditStats(
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

        // Get events from the specified period and previous period
        Instant now = Instant.now();
        Instant start = now.minus(java.time.Duration.ofDays(days));
        Instant prevStart = start.minus(java.time.Duration.ofDays(days));

        List<PersistentAuditEvent> currentEvents = auditRepository.findByTimestampAfter(start);
        List<PersistentAuditEvent> prevEvents =
                auditRepository.findAllByTimestampBetweenForExport(prevStart, start);

        // Compute metrics for current period
        AuditMetrics currentMetrics = computeMetrics(currentEvents);
        AuditMetrics prevMetrics = computeMetrics(prevEvents);

        // Get hourly distribution using DB aggregation
        List<Object[]> hourlyData = auditRepository.histogramByHourBetween(start, now);
        Map<String, Long> hourlyDistribution = new TreeMap<>();
        for (int h = 0; h < 24; h++) {
            hourlyDistribution.put(String.format("%02d", h), 0L);
        }
        for (Object[] row : hourlyData) {
            int hour = ((Number) row[0]).intValue();
            long count = ((Number) row[1]).longValue();
            hourlyDistribution.put(String.format("%02d", hour), count);
        }

        return ResponseEntity.ok(
                AuditStatsData.builder()
                        .totalEvents(currentMetrics.totalEvents)
                        .prevTotalEvents(prevMetrics.totalEvents)
                        .uniqueUsers(currentMetrics.uniqueUsers)
                        .prevUniqueUsers(prevMetrics.uniqueUsers)
                        .successRate(currentMetrics.successRate)
                        .prevSuccessRate(prevMetrics.successRate)
                        .avgLatencyMs(currentMetrics.avgLatencyMs)
                        .prevAvgLatencyMs(prevMetrics.avgLatencyMs)
                        .errorCount(currentMetrics.errorCount)
                        .topEventType(currentMetrics.topEventType)
                        .topUser(currentMetrics.topUser)
                        .eventsByType(currentMetrics.eventsByType)
                        .eventsByUser(currentMetrics.eventsByUser)
                        .topTools(currentMetrics.topTools)
                        .hourlyDistribution(hourlyDistribution)
                        .build());
    }

    /** Compute metrics from a list of audit events. */
    private AuditMetrics computeMetrics(List<PersistentAuditEvent> events) {
        if (events.isEmpty()) {
            return AuditMetrics.builder().build();
        }

        // Count by type
        Map<String, Long> eventsByType =
                events.stream()
                        .collect(
                                Collectors.groupingBy(
                                        PersistentAuditEvent::getType, Collectors.counting()));

        // Count by principal (user)
        Map<String, Long> eventsByUser =
                events.stream()
                        .collect(
                                Collectors.groupingBy(
                                        PersistentAuditEvent::getPrincipal, Collectors.counting()));

        // Parse JSON data once for success rate, latency, tool extraction, and error counting
        long successCount = 0;
        long failureCount = 0;
        long errorCount = 0;
        long totalLatencyMs = 0;
        long latencyCount = 0;
        Map<String, Long> topTools = new HashMap<>();

        for (PersistentAuditEvent event : events) {
            if (event.getData() != null) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> data = objectMapper.readValue(event.getData(), Map.class);

                    // Track success/failure (safe type conversion)
                    // Check both "status" (current) and "outcome" (legacy) for compatibility
                    Object statusObj = data.get("status");
                    if (statusObj == null) {
                        statusObj = data.get("outcome");
                    }
                    String status = null;
                    if (statusObj instanceof String) {
                        status = (String) statusObj;
                    } else if (statusObj != null) {
                        status = String.valueOf(statusObj);
                    }
                    if ("success".equals(status)) {
                        successCount++;
                    } else if ("failure".equals(status)) {
                        failureCount++;
                        errorCount++;
                    } else {
                        // Check statusCode for error counting (when status is not explicit failure)
                        Object statusCode = data.get("statusCode");
                        if (statusCode != null) {
                            try {
                                int statusCodeVal;
                                if (statusCode instanceof Number) {
                                    statusCodeVal = ((Number) statusCode).intValue();
                                } else if (statusCode instanceof String) {
                                    statusCodeVal = Integer.parseInt((String) statusCode);
                                } else {
                                    statusCodeVal = 0;
                                }
                                if (statusCodeVal >= 400) {
                                    errorCount++;
                                }
                            } catch (NumberFormatException e) {
                                log.trace("Failed to parse statusCode value: {}", statusCode);
                            }
                        }
                    }

                    // Track latency (safe conversion to handle strings/numbers)
                    Object latency = data.get("latencyMs");
                    if (latency != null) {
                        try {
                            long latencyVal;
                            if (latency instanceof Number) {
                                latencyVal = ((Number) latency).longValue();
                            } else if (latency instanceof String) {
                                latencyVal = Long.parseLong((String) latency);
                            } else {
                                latencyVal = 0;
                            }
                            totalLatencyMs += latencyVal;
                            latencyCount++;
                        } catch (NumberFormatException e) {
                            log.trace("Failed to parse latency value: {}", latency);
                        }
                    }

                    // Extract tool from path (safe type conversion)
                    Object pathObj = data.get("path");
                    String path = null;
                    if (pathObj instanceof String) {
                        path = (String) pathObj;
                    } else if (pathObj != null) {
                        path = String.valueOf(pathObj);
                    }
                    if (path != null && !path.isEmpty()) {
                        String[] parts = path.split("/");
                        if (parts.length > 0) {
                            String tool = parts[parts.length - 1];
                            if (!tool.isEmpty()) {
                                topTools.put(tool, topTools.getOrDefault(tool, 0L) + 1);
                            }
                        }
                    }
                } catch (JacksonException e) {
                    log.trace("Failed to parse audit event data: {}", event.getData());
                }
            }
        }

        // Calculate success rate
        double successRate = 0;
        long totalWithOutcome = successCount + failureCount;
        if (totalWithOutcome > 0) {
            successRate = (successCount * 100.0) / totalWithOutcome;
        }

        // Calculate average latency
        double avgLatencyMs = 0;
        if (latencyCount > 0) {
            avgLatencyMs = totalLatencyMs / (double) latencyCount;
        }

        // Get top event type
        String topEventType =
                eventsByType.entrySet().stream()
                        .max((e1, e2) -> Long.compare(e1.getValue(), e2.getValue()))
                        .map(Map.Entry::getKey)
                        .orElse("");

        // Get top user
        String topUser =
                eventsByUser.entrySet().stream()
                        .max((e1, e2) -> Long.compare(e1.getValue(), e2.getValue()))
                        .map(Map.Entry::getKey)
                        .orElse("");

        // Sort and limit top tools to 10
        Map<String, Long> topToolsSorted =
                topTools.entrySet().stream()
                        .sorted((e1, e2) -> Long.compare(e2.getValue(), e1.getValue()))
                        .limit(10)
                        .collect(
                                Collectors.toMap(
                                        Map.Entry::getKey,
                                        Map.Entry::getValue,
                                        (e1, e2) -> e1,
                                        LinkedHashMap::new));

        return AuditMetrics.builder()
                .totalEvents(events.size())
                .uniqueUsers((int) eventsByUser.size())
                .successRate(successRate)
                .avgLatencyMs(avgLatencyMs)
                .errorCount(errorCount)
                .topEventType(topEventType)
                .topUser(topUser)
                .eventsByType(eventsByType)
                .eventsByUser(eventsByUser)
                .topTools(topToolsSorted)
                .build();
    }

    /**
     * Export audit data in CSV or JSON format. Maps to frontend's exportData() call. Supports both
     * single values and multi-select arrays for eventType and username.
     *
     * @param format Export format (csv or json)
     * @param fields Comma-separated list of fields to include (e.g.,
     *     "date,username,tool,documentName,author,fileHash")
     * @param eventTypes Filter by event type(s) - can be single value or array
     * @param usernames Filter by username(s) - can be single value or array
     * @param startDate Filter start date
     * @param endDate Filter end date
     * @return File download response
     */
    @GetMapping("/audit-export")
    public ResponseEntity<byte[]> exportAuditData(
            @RequestParam(value = "format", defaultValue = "csv") String format,
            @RequestParam(value = "fields", required = false) String fields,
            @RequestParam(value = "eventType", required = false) String[] eventTypes,
            @RequestParam(value = "username", required = false) String[] usernames,
            @RequestParam(value = "startDate", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate startDate,
            @RequestParam(value = "endDate", required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate endDate) {

        // Get data with same filtering as getAuditEvents
        List<PersistentAuditEvent> events;

        // Convert arrays to lists
        List<String> eventTypeList =
                (eventTypes != null && eventTypes.length > 0) ? Arrays.asList(eventTypes) : null;
        List<String> usernameList =
                (usernames != null && usernames.length > 0) ? Arrays.asList(usernames) : null;

        Instant startInstant = null;
        Instant endInstant = null;
        if (startDate != null && endDate != null) {
            startInstant = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            endInstant = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
        }

        if (eventTypeList != null
                && usernameList != null
                && startInstant != null
                && endInstant != null) {
            events =
                    auditRepository.findByTypeInAndPrincipalInAndTimestampBetweenForExport(
                            eventTypeList, usernameList, startInstant, endInstant);
        } else if (eventTypeList != null && usernameList != null) {
            events =
                    auditRepository.findByTypeInAndPrincipalInForExport(
                            eventTypeList, usernameList);
        } else if (eventTypeList != null && startInstant != null && endInstant != null) {
            events =
                    auditRepository.findByTypeInAndTimestampBetweenForExport(
                            eventTypeList, startInstant, endInstant);
        } else if (usernameList != null && startInstant != null && endInstant != null) {
            events =
                    auditRepository.findByPrincipalInAndTimestampBetweenForExport(
                            usernameList, startInstant, endInstant);
        } else if (startInstant != null && endInstant != null) {
            events = auditRepository.findAllByTimestampBetweenForExport(startInstant, endInstant);
        } else if (eventTypeList != null) {
            events = auditRepository.findByTypeInForExport(eventTypeList);
        } else if (usernameList != null) {
            events = auditRepository.findByPrincipalInForExport(usernameList);
        } else {
            events = auditRepository.findAll();
        }

        // Export based on format
        if ("json".equalsIgnoreCase(format)) {
            return exportAsJson(events);
        } else {
            return exportAsCsv(events, fields);
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

        // Extract IP address (check both clientIp and __ipAddress for async/audited events)
        String ipAddress = "";
        Object ipObj = details.get("clientIp");
        if (ipObj != null) {
            ipAddress = String.valueOf(ipObj);
        } else {
            ipObj = details.get("__ipAddress");
            if (ipObj != null) {
                ipAddress = String.valueOf(ipObj);
            }
        }

        return AuditEventDto.builder()
                .id(String.valueOf(event.getId()))
                .timestamp(event.getTimestamp().toString())
                .eventType(event.getType())
                .username(event.getPrincipal())
                .ipAddress(ipAddress)
                .details(details)
                .build();
    }

    private ResponseEntity<byte[]> exportAsCsv(List<PersistentAuditEvent> events, String fields) {
        // Parse selected fields (comma-separated:
        // date,username,tool,documentName,author,fileHash,ipAddress,etc)
        Set<String> selectedFields = new HashSet<>();
        if (fields != null && !fields.trim().isEmpty()) {
            String[] fieldArray = fields.split(",");
            for (String field : fieldArray) {
                selectedFields.add(field.trim().toLowerCase());
            }
        }

        // If no fields specified, use default technical export
        if (selectedFields.isEmpty()) {
            return exportAsDefaultCsv(events);
        }

        StringBuilder csv = new StringBuilder();

        // Build header based on selected fields
        List<String> headerOrder = new ArrayList<>();
        if (selectedFields.contains("date")) headerOrder.add("date");
        if (selectedFields.contains("username")) headerOrder.add("username");
        if (selectedFields.contains("ipaddress")) headerOrder.add("ipaddress");
        if (selectedFields.contains("tool")) headerOrder.add("tool");
        if (selectedFields.contains("documentname")) headerOrder.add("documentname");
        if (selectedFields.contains("outcome")) headerOrder.add("outcome");
        if (selectedFields.contains("author")) headerOrder.add("author");
        if (selectedFields.contains("filehash")) headerOrder.add("filehash");
        if (selectedFields.contains("eventtype")) headerOrder.add("eventtype");

        // Write header
        for (int i = 0; i < headerOrder.size(); i++) {
            csv.append(capitalizeHeader(headerOrder.get(i)));
            if (i < headerOrder.size() - 1) csv.append(",");
        }
        csv.append("\n");

        DateTimeFormatter formatter = DateTimeFormatter.ISO_INSTANT;

        // Write data rows
        for (PersistentAuditEvent event : events) {
            Map<String, String> rowData = extractEventData(event, formatter);

            for (int i = 0; i < headerOrder.size(); i++) {
                csv.append(escapeCSV(rowData.getOrDefault(headerOrder.get(i), "")));
                if (i < headerOrder.size() - 1) csv.append(",");
            }
            csv.append("\n");
        }

        byte[] csvBytes = csv.toString().getBytes();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        headers.setContentDispositionFormData(
                "attachment", "audit_export_" + System.currentTimeMillis() + ".csv");

        return ResponseEntity.ok().headers(headers).body(csvBytes);
    }

    private ResponseEntity<byte[]> exportAsDefaultCsv(List<PersistentAuditEvent> events) {
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

    private Map<String, String> extractEventData(
            PersistentAuditEvent event, DateTimeFormatter formatter) {
        Map<String, String> data = new HashMap<>();

        data.put("date", formatter.format(event.getTimestamp()));
        data.put("username", event.getPrincipal());
        data.put("eventtype", event.getType());
        data.put("ipaddress", "");
        data.put("tool", "");
        data.put("documentname", "");
        data.put("outcome", "");
        data.put("author", "");
        data.put("filehash", "");

        if (event.getData() != null) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> eventData = objectMapper.readValue(event.getData(), Map.class);

                // Extract IP address (check both clientIp and __ipAddress)
                String ipAddress = "";
                if (eventData.containsKey("clientIp")) {
                    ipAddress = String.valueOf(eventData.getOrDefault("clientIp", ""));
                } else if (eventData.containsKey("__ipAddress")) {
                    ipAddress = String.valueOf(eventData.getOrDefault("__ipAddress", ""));
                }
                if (!ipAddress.isEmpty()) {
                    data.put("ipaddress", ipAddress);
                }

                // Extract outcome (success/failure)
                if (eventData.containsKey("outcome")) {
                    data.put("outcome", String.valueOf(eventData.getOrDefault("outcome", "")));
                }

                // Extract tool from path
                if (eventData.containsKey("path")) {
                    String path = (String) eventData.get("path");
                    if (path != null) {
                        String[] parts = path.split("/");
                        data.put("tool", parts.length > 0 ? parts[parts.length - 1] : "");
                    }
                }

                // Extract file information
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> files =
                        (List<Map<String, Object>>) eventData.get("files");
                if (files != null && !files.isEmpty()) {
                    Map<String, Object> firstFile = files.get(0);
                    data.put("documentname", String.valueOf(firstFile.getOrDefault("name", "")));
                    data.put("author", String.valueOf(firstFile.getOrDefault("pdfAuthor", "")));
                    data.put("filehash", String.valueOf(firstFile.getOrDefault("fileHash", "")));
                }
            } catch (Exception e) {
                log.trace("Failed to parse audit event data: {}", event.getData());
            }
        }

        return data;
    }

    private String capitalizeHeader(String field) {
        return switch (field.toLowerCase()) {
            case "date" -> "Date";
            case "username" -> "Username";
            case "ipaddress" -> "IP Address";
            case "tool" -> "Tool";
            case "documentname" -> "Document Name";
            case "outcome" -> "Outcome";
            case "author" -> "Author";
            case "filehash" -> "File Hash";
            case "eventtype" -> "Event Type";
            default -> field;
        };
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

    @lombok.Data
    @lombok.Builder
    public static class AuditStatsData {
        private long totalEvents;
        private long prevTotalEvents;
        private int uniqueUsers;
        private int prevUniqueUsers;
        private double successRate;
        private double prevSuccessRate;
        private double avgLatencyMs;
        private double prevAvgLatencyMs;
        private long errorCount;
        private String topEventType;
        private String topUser;
        private Map<String, Long> eventsByType;
        private Map<String, Long> eventsByUser;
        private Map<String, Long> topTools;
        private Map<String, Long> hourlyDistribution;
    }

    @lombok.Data
    @lombok.Builder
    public static class AuditMetrics {
        private long totalEvents;
        private int uniqueUsers;
        private double successRate;
        private double avgLatencyMs;
        private long errorCount;
        private String topEventType;
        private String topUser;
        private Map<String, Long> eventsByType;
        private Map<String, Long> eventsByUser;
        private Map<String, Long> topTools;
    }

    /**
     * Clear all audit data from the database. This is an irreversible operation. Requires ADMIN
     * role.
     *
     * @return Success response
     */
    @PostMapping("/audit-clear-all")
    public ResponseEntity<?> clearAllAuditData() {
        try {
            // Delete all audit events
            auditRepository.deleteAll();
            log.warn("All audit data has been cleared by admin user");
            return ResponseEntity.ok()
                    .body(Map.of("message", "All audit data has been cleared successfully"));
        } catch (Exception e) {
            log.error("Error clearing audit data", e);
            return ResponseEntity.internalServerError()
                    .body("Failed to clear audit data: " + e.getMessage());
        }
    }
}
