package stirling.software.proprietary.controller.api;

import java.nio.charset.StandardCharsets;
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

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.BeanParam;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.model.api.audit.AuditDataRequest;
import stirling.software.proprietary.model.api.audit.AuditDataResponse;
import stirling.software.proprietary.model.api.audit.AuditExportRequest;
import stirling.software.proprietary.model.api.audit.AuditStatsResponse;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/** REST endpoints for the audit dashboard. */
@Slf4j
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/audit")
@RolesAllowed("ADMIN")
@RequiredArgsConstructor
@EnterpriseEndpoint
@Tag(name = "Audit", description = "Only Enterprise - Audit related operations")
public class AuditDashboardController {

    private final PersistentAuditEventRepository auditRepository;
    private final ObjectMapper objectMapper;

    /** Get audit events data for the dashboard tables. */
    @GET
    @jakarta.ws.rs.Path("/data")
    @Operation(summary = "Get audit events data")
    public AuditDataResponse getAuditData(@BeanParam AuditDataRequest request) {

        // TODO: Migration required - PersistentAuditEventRepository is a collaborator that must be
        // migrated to io.quarkus.hibernate.orm.panache.PanacheRepositoryBase<PersistentAuditEvent,
        // Long>. Its paged finders should return io.quarkus.panache.common.PanacheQuery (or apply
        // the Page/Sort built here) instead of org.springframework.data.domain.Page. The pagination
        // request below is expressed with Panache Page/Sort; once the repository accepts these the
        // .page(...)/.list()/.count()/.pageCount() calls used here will resolve.
        Page page = Page.of(request.getPage(), request.getSize());
        Sort sort = Sort.by("timestamp", Sort.Direction.Descending);
        io.quarkus.hibernate.orm.panache.PanacheQuery<PersistentAuditEvent> query;

        String type = request.getType();
        String principal = request.getPrincipal();
        LocalDate startDate = request.getStartDate();
        LocalDate endDate = request.getEndDate();

        if (type != null && principal != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            query =
                    auditRepository.findByPrincipalAndTypeAndTimestampBetween(
                            principal, type, start, end, page, sort);
        } else if (type != null && principal != null) {
            query = auditRepository.findByPrincipalAndType(principal, type, page, sort);
        } else if (type != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            query = auditRepository.findByTypeAndTimestampBetween(type, start, end, page, sort);
        } else if (principal != null && startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            query =
                    auditRepository.findByPrincipalAndTimestampBetween(
                            principal, start, end, page, sort);
        } else if (startDate != null && endDate != null) {
            Instant start = startDate.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant end = endDate.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
            query = auditRepository.findByTimestampBetween(start, end, page, sort);
        } else if (type != null) {
            query = auditRepository.findByType(type, page, sort);
        } else if (principal != null) {
            query = auditRepository.findByPrincipal(principal, page, sort);
        } else {
            query = auditRepository.findAll(sort).page(page);
        }

        // Logging
        List<PersistentAuditEvent> content = query.list();

        return new AuditDataResponse(
                content, query.pageCount(), query.count(), query.page().index);
    }

    /** Get statistics for charts (last X days). Existing behavior preserved. */
    @GET
    @jakarta.ws.rs.Path("/stats")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(summary = "Get audit statistics for the last N days")
    public AuditStatsResponse getAuditStats(
            @Schema(
                            description = "Number of days to look back for audit events",
                            example = "7",
                            requiredMode = Schema.RequiredMode.REQUIRED)
                    @QueryParam("days")
                    @DefaultValue("7")
                    int days) {

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
    // @GET
    // @Path("/stats/range")
    // @Operation(summary = "Get audit statistics for a date range (aggregated in DB)")
    // public Map<String, Object> getAuditStatsRange(@BeanParam AuditDateExportRequest
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
    @GET
    @jakarta.ws.rs.Path("/types")
    @Produces(MediaType.APPLICATION_JSON)
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
    @GET
    @jakarta.ws.rs.Path("/export/csv")
    @Operation(summary = "Export audit data as CSV")
    public Response exportAuditData(@BeanParam AuditExportRequest request) {

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

        byte[] csvBytes = csv.toString().getBytes(StandardCharsets.UTF_8);

        // Set up HTTP headers for download
        return Response.ok(csvBytes)
                .type(MediaType.APPLICATION_OCTET_STREAM)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "form-data; name=\"attachment\"; filename=\"audit_export.csv\"")
                .build();
    }

    /** Export audit data as JSON. */
    @GET
    @jakarta.ws.rs.Path("/export/json")
    @Operation(summary = "Export audit data as JSON")
    public Response exportAuditDataJson(@BeanParam AuditExportRequest request) {

        List<PersistentAuditEvent> events = getAuditEventsByCriteria(request);

        // Convert to JSON
        try {
            byte[] jsonBytes = objectMapper.writeValueAsBytes(events);

            // Set up HTTP headers for download
            return Response.ok(jsonBytes)
                    .type(MediaType.APPLICATION_JSON)
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "form-data; name=\"attachment\"; filename=\"audit_export.json\"")
                    .build();
        } catch (JacksonException e) {
            log.error("Error serializing audit events to JSON", e);
            return Response.serverError().build();
        }
    }

    // /** Get all unique principals. */
    // @GET
    // @Path("/principals")
    // @Operation(summary = "Get all distinct principals")
    // public List<String> getPrincipals() {
    //     return auditRepository.findDistinctPrincipals();
    // }

    // /** Get principals by event type. */
    // @GET
    // @Path("/types/{type}/principals")
    // @Operation(summary = "Get distinct principals for a given type")
    // public List<String> getPrincipalsByType(@PathParam("type") String type) {
    //     return auditRepository.findDistinctPrincipalsByType(type);
    // }

    // /** Latest helpers */
    // @GET
    // @Path("/latest")
    // @Operation(summary = "Get the latest audit event, optionally filtered by type or principal")
    // public Response getLatest(
    //         @QueryParam("type") String type,
    //         @QueryParam("principal") String principal) {
    //     if (type != null) {
    //         return auditRepository
    //                 .findTopByTypeOrderByTimestampDesc(type)
    //                 .map(e -> Response.ok(e).build())
    //                 .orElse(Response.noContent().build());
    //     } else if (principal != null) {
    //         return auditRepository
    //                 .findTopByPrincipalOrderByTimestampDesc(principal)
    //                 .map(e -> Response.ok(e).build())
    //                 .orElse(Response.noContent().build());
    //     }
    //     return auditRepository
    //             .findTopByOrderByTimestampDesc()
    //             .map(e -> Response.ok(e).build())
    //             .orElse(Response.noContent().build());
    // }

    /** Cleanup endpoints data before a certain date */
    @DELETE
    @jakarta.ws.rs.Path("/cleanup/before")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Cleanup audit events before a certain date",
            description = "Deletes all audit events before the specified date.")
    public Map<String, Object> cleanupBefore(
            @QueryParam("date")
                    @Schema(
                            description = "The cutoff date for cleanup",
                            example = "2025-01-01",
                            format = "date")
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
            events = auditRepository.listAll();
        }
        return events;
    }
}
