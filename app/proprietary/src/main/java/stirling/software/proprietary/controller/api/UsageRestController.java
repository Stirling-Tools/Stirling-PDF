package stirling.software.proprietary.controller.api;

import java.util.*;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;

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
     * @param includeHome Whether to include homepage ("/") in results
     * @param includeLogin Whether to include login page ("/login") in results
     * @return Endpoint statistics response
     */
    @GetMapping("/usage-endpoint-statistics")
    public ResponseEntity<EndpointStatisticsResponse> getEndpointStatistics(
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "includeHome", defaultValue = "true") boolean includeHome,
            @RequestParam(value = "includeLogin", defaultValue = "true") boolean includeLogin) {

        // Get all HTTP_REQUEST audit events
        List<PersistentAuditEvent> httpEvents =
                auditRepository.findByTypeForExport(AuditEventType.HTTP_REQUEST.name());

        // Count visits per endpoint
        Map<String, Long> endpointCounts = new HashMap<>();

        for (PersistentAuditEvent event : httpEvents) {
            String endpoint = extractEndpointFromAuditData(event.getData());
            if (endpoint != null) {
                // Apply filters
                if (!includeHome && "/".equals(endpoint)) {
                    continue;
                }
                if (!includeLogin && "/login".equals(endpoint)) {
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

        } catch (JsonProcessingException e) {
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
