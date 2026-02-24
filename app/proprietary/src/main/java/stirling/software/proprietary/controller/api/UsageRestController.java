package stirling.software.proprietary.controller.api;

import java.util.*;
import java.util.stream.Collectors;

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

/** REST API controller for usage analytics data used by React frontend. */
@Slf4j
@ProprietaryUiDataApi
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@EnterpriseEndpoint
public class UsageRestController {

    private final PersistentAuditEventRepository auditRepository;
    private final ObjectMapper objectMapper;

    /**
     * Get endpoint statistics derived from audit events. This endpoint analyzes HTTP_REQUEST audit
     * events to generate usage statistics.
     *
     * @param limit Optional limit on number of endpoints to return
     * @param dataType Type of data to include: "all" (default), "api" (API endpoints excluding
     *     auth), or "ui" (non-API endpoints)
     * @return Endpoint statistics response
     */
    @GetMapping("/usage-endpoint-statistics")
    public ResponseEntity<EndpointStatisticsResponse> getEndpointStatistics(
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "dataType", defaultValue = "all") String dataType) {

        // Get all HTTP_REQUEST audit events
        List<PersistentAuditEvent> httpEvents =
                auditRepository.findByTypeForExport(AuditEventType.HTTP_REQUEST.name());

        // Count visits per endpoint
        Map<String, Long> endpointCounts = new HashMap<>();

        for (PersistentAuditEvent event : httpEvents) {
            String endpoint = extractEndpointFromAuditData(event.getData());
            if (endpoint != null) {
                // Apply data type filter
                if (!shouldIncludeEndpoint(endpoint, dataType)) {
                    continue;
                }

                endpointCounts.merge(endpoint, 1L, Long::sum);
            }
        }

        // Calculate totals
        long totalVisits = endpointCounts.values().stream().mapToLong(Long::longValue).sum();
        int totalEndpoints = endpointCounts.size();

        // Convert to list and sort by visit count (descending)
        List<EndpointStatistic> statistics =
                endpointCounts.entrySet().stream()
                        .map(
                                entry -> {
                                    String endpoint = entry.getKey();
                                    long visits = entry.getValue();
                                    double percentage =
                                            totalVisits > 0 ? (visits * 100.0 / totalVisits) : 0.0;

                                    return EndpointStatistic.builder()
                                            .endpoint(endpoint)
                                            .visits((int) visits)
                                            .percentage(Math.round(percentage * 10.0) / 10.0)
                                            .build();
                                })
                        .sorted(Comparator.comparingInt(EndpointStatistic::getVisits).reversed())
                        .collect(Collectors.toList());

        // Apply limit if specified
        if (limit != null && limit > 0 && statistics.size() > limit) {
            statistics = statistics.subList(0, limit);
        }

        EndpointStatisticsResponse response =
                EndpointStatisticsResponse.builder()
                        .endpoints(statistics)
                        .totalEndpoints(totalEndpoints)
                        .totalVisits((int) totalVisits)
                        .build();

        return ResponseEntity.ok(response);
    }

    /**
     * Extract the endpoint path from the audit event's data field. The data field contains JSON
     * with an "endpoint" or "path" key.
     *
     * @param dataJson JSON string from audit event
     * @return Endpoint path or null if not found
     */
    private String extractEndpointFromAuditData(String dataJson) {
        if (dataJson == null || dataJson.isEmpty()) {
            return null;
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> data = objectMapper.readValue(dataJson, Map.class);

            // Try common keys for endpoint path
            Object endpoint = data.get("endpoint");
            if (endpoint != null) {
                return normalizeEndpoint(endpoint.toString());
            }

            Object path = data.get("path");
            if (path != null) {
                return normalizeEndpoint(path.toString());
            }

            // Fallback: check if there's a request-related key
            Object requestUri = data.get("requestUri");
            if (requestUri != null) {
                return normalizeEndpoint(requestUri.toString());
            }

        } catch (JacksonException e) {
            log.debug("Failed to parse audit data JSON: {}", dataJson, e);
        }

        return null;
    }

    /**
     * Normalize endpoint paths by removing query strings and standardizing format.
     *
     * @param endpoint Raw endpoint path
     * @return Normalized endpoint path
     */
    private String normalizeEndpoint(String endpoint) {
        if (endpoint == null) {
            return null;
        }

        // Remove query string
        int queryIndex = endpoint.indexOf('?');
        if (queryIndex != -1) {
            endpoint = endpoint.substring(0, queryIndex);
        }

        // Ensure it starts with /
        if (!endpoint.startsWith("/")) {
            endpoint = "/" + endpoint;
        }

        return endpoint;
    }

    /**
     * Determine if an endpoint should be included based on the data type filter.
     *
     * @param endpoint The endpoint path to check
     * @param dataType The filter type: "all", "api", or "ui"
     * @return true if the endpoint should be included, false otherwise
     */
    private boolean shouldIncludeEndpoint(String endpoint, String dataType) {
        if ("all".equalsIgnoreCase(dataType)) {
            return true;
        }

        boolean isApiEndpoint = isApiEndpoint(endpoint);

        if ("api".equalsIgnoreCase(dataType)) {
            return isApiEndpoint;
        } else if ("ui".equalsIgnoreCase(dataType)) {
            return !isApiEndpoint;
        }

        // Default to including all if unrecognized type
        return true;
    }

    /**
     * Check if an endpoint is an API endpoint. API endpoints match /api/v1/* pattern but exclude
     * /api/v1/auth/* paths.
     *
     * @param endpoint The endpoint path to check
     * @return true if this is an API endpoint (excluding auth endpoints), false otherwise
     */
    private boolean isApiEndpoint(String endpoint) {
        if (endpoint == null) {
            return false;
        }

        // Check if it starts with /api/v1/
        if (!endpoint.startsWith("/api/v1/")) {
            return false;
        }

        // Exclude auth endpoints
        if (endpoint.startsWith("/api/v1/auth/")) {
            return false;
        }

        return true;
    }

    // DTOs for response formatting

    @lombok.Data
    @lombok.Builder
    public static class EndpointStatisticsResponse {
        private List<EndpointStatistic> endpoints;
        private int totalEndpoints;
        private int totalVisits;
    }

    @lombok.Data
    @lombok.Builder
    public static class EndpointStatistic {
        private String endpoint;
        private int visits;
        private double percentage;
    }
}
