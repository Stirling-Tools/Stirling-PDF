package stirling.software.SPDF.controller.web;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointInspector;
import stirling.software.SPDF.config.StartupApplicationListener;
import stirling.software.SPDF.service.WeeklyActiveUsersService;
import stirling.software.common.annotations.api.InfoApi;
import stirling.software.common.model.ApplicationProperties;

@InfoApi
@Path("/api/v1/info")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class MetricsController {

    private final ApplicationProperties applicationProperties;
    private final MeterRegistry meterRegistry;
    private final EndpointInspector endpointInspector;
    // @Autowired(required=false) Optional<WeeklyActiveUsersService> -> CDI Instance<T> (optional
    // bean)
    private final Instance<WeeklyActiveUsersService> wauService;
    private boolean metricsEnabled;

    @PostConstruct
    public void init() {
        metricsEnabled = applicationProperties.getMetrics().isEnabled();
    }

    @GET
    @Path("/status")
    @Operation(
            summary = "Application status and version",
            description =
                    "This endpoint returns the status of the application and its version number.")
    public Response getStatus() {
        return getApplicationStatus();
    }

    @GET
    @Path("/health")
    @Operation(
            summary = "Application health check",
            description =
                    "This endpoint returns the health status of the application and its version number. Mirrors /api/v1/info/status.")
    public Response getHealth() {
        return getApplicationStatus();
    }

    private Response getApplicationStatus() {
        Map<String, String> status = new HashMap<>();
        status.put("status", "UP");
        String version = getClass().getPackage().getImplementationVersion();
        if (version == null) {
            version = getVersionFromProperties();
        }
        status.put("version", version);
        return Response.ok(status).build();
    }

    private String getVersionFromProperties() {
        try (InputStream is = getClass().getResourceAsStream("/version.properties")) {
            if (is != null) {
                Properties props = new Properties();
                props.load(is);
                return props.getProperty("version");
            }
        } catch (IOException e) {
            log.error("Failed to load version.properties", e);
        }
        return null;
    }

    @GET
    @Path("/load")
    @Operation(
            summary = "GET request count",
            description =
                    "This endpoint returns the total count of GET requests for a specific endpoint or all endpoints.")
    public Response getPageLoads(
            @QueryParam("endpoint") @Parameter(description = "endpoint") String endpoint) {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        try {
            double count = getRequestCount("GET", Optional.ofNullable(endpoint));
            return Response.ok(count).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GET
    @Path("/load/unique")
    @Operation(
            summary = "Unique users count for GET requests",
            description =
                    "This endpoint returns the count of unique users for GET requests for a specific endpoint or all endpoints.")
    public Response getUniquePageLoads(
            @QueryParam("endpoint") @Parameter(description = "endpoint") String endpoint) {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        try {
            double count = getUniqueUserCount("GET", Optional.ofNullable(endpoint));
            return Response.ok(count).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GET
    @Path("/load/all")
    @Operation(
            summary = "GET requests count for all endpoints",
            description = "This endpoint returns the count of GET requests for each endpoint.")
    public Response getAllEndpointLoads() {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        try {
            List<EndpointCount> results = getEndpointCounts("GET");
            return Response.ok(results).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GET
    @Path("/load/all/unique")
    @Operation(
            summary = "Unique users count for GET requests for all endpoints",
            description =
                    "This endpoint returns the count of unique users for GET requests for each endpoint.")
    public Response getAllUniqueEndpointLoads() {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        try {
            List<EndpointCount> results = getUniqueUserCounts("GET");
            return Response.ok(results).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GET
    @Path("/requests")
    @Operation(
            summary = "POST request count",
            description =
                    "This endpoint returns the total count of POST requests for a specific endpoint or all endpoints.")
    public Response getTotalRequests(
            @QueryParam("endpoint") @Parameter(description = "endpoint") String endpoint) {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        try {
            double count = getRequestCount("POST", Optional.ofNullable(endpoint));
            return Response.ok(count).build();
        } catch (Exception e) {
            return Response.ok(-1).build();
        }
    }

    @GET
    @Path("/requests/unique")
    @Operation(
            summary = "Unique users count for POST requests",
            description =
                    "This endpoint returns the count of unique users for POST requests for a specific endpoint or all endpoints.")
    public Response getUniqueTotalRequests(
            @QueryParam("endpoint") @Parameter(description = "endpoint") String endpoint) {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        try {
            double count = getUniqueUserCount("POST", Optional.ofNullable(endpoint));
            return Response.ok(count).build();
        } catch (Exception e) {
            return Response.ok(-1).build();
        }
    }

    @GET
    @Path("/requests/all")
    @Operation(
            summary = "POST requests count for all endpoints",
            description = "This endpoint returns the count of POST requests for each endpoint.")
    public Response getAllPostRequests() {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        try {
            List<EndpointCount> results = getEndpointCounts("POST");
            return Response.ok(results).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GET
    @Path("/requests/all/unique")
    @Operation(
            summary = "Unique users count for POST requests for all endpoints",
            description =
                    "This endpoint returns the count of unique users for POST requests for each endpoint.")
    public Response getAllUniquePostRequests() {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        try {
            List<EndpointCount> results = getUniqueUserCounts("POST");
            return Response.ok(results).build();
        } catch (Exception e) {
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    private double getRequestCount(String method, Optional<String> endpoint) {
        return meterRegistry.find("http.requests").tag("method", method).counters().stream()
                .filter(
                        counter -> {
                            String uri = counter.getId().getTag("uri");

                            // Apply filtering logic - Skip if uri is null
                            if (uri == null) {
                                return false;
                            }

                            // For POST requests, only include if they start with /api/v1
                            if ("POST".equals(method) && !uri.contains("api/v1")) {
                                return false;
                            }

                            if (uri.contains(".txt")) {
                                return false;
                            }

                            // For GET requests, validate if we have a list of valid endpoints
                            final boolean validateGetEndpoints =
                                    endpointInspector.getValidGetEndpoints().size() != 0;
                            if ("GET".equals(method)
                                    && validateGetEndpoints
                                    && !endpointInspector.isValidGetEndpoint(uri)) {
                                log.debug("Skipping invalid GET endpoint: {}", uri);
                                return false;
                            }

                            // Filter for specific endpoint if provided
                            return !endpoint.isPresent() || endpoint.get().equals(uri);
                        })
                .mapToDouble(Counter::count)
                .sum();
    }

    private List<EndpointCount> getEndpointCounts(String method) {
        Map<String, Double> counts = new HashMap<>();
        meterRegistry
                .find("http.requests")
                .tag("method", method)
                .counters()
                .forEach(
                        counter -> {
                            String uri = counter.getId().getTag("uri");

                            // Skip if uri is null
                            if (uri == null) {
                                return;
                            }

                            // For POST requests, only include if they start with /api/v1
                            if ("POST".equals(method) && !uri.contains("api/v1")) {
                                return;
                            }

                            if (uri.contains(".txt")) {
                                return;
                            }

                            // For GET requests, validate if we have a list of valid endpoints
                            final boolean validateGetEndpoints =
                                    endpointInspector.getValidGetEndpoints().size() != 0;
                            if ("GET".equals(method)
                                    && validateGetEndpoints
                                    && !endpointInspector.isValidGetEndpoint(uri)) {
                                log.debug("Skipping invalid GET endpoint: {}", uri);
                                return;
                            }

                            counts.merge(uri, counter.count(), Double::sum);
                        });

        return counts.entrySet().stream()
                .map(entry -> new EndpointCount(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(EndpointCount::getCount).reversed())
                .toList();
    }

    private double getUniqueUserCount(String method, Optional<String> endpoint) {
        Set<String> uniqueUsers = new HashSet<>();
        meterRegistry.find("http.requests").tag("method", method).counters().stream()
                .filter(
                        counter -> {
                            String uri = counter.getId().getTag("uri");

                            // Skip if uri is null
                            if (uri == null) {
                                return false;
                            }

                            // For POST requests, only include if they start with /api/v1
                            if ("POST".equals(method) && !uri.contains("api/v1")) {
                                return false;
                            }

                            if (uri.contains(".txt")) {
                                return false;
                            }

                            // For GET requests, validate if we have a list of valid endpoints
                            final boolean validateGetEndpoints =
                                    endpointInspector.getValidGetEndpoints().size() != 0;
                            if ("GET".equals(method)
                                    && validateGetEndpoints
                                    && !endpointInspector.isValidGetEndpoint(uri)) {
                                log.debug("Skipping invalid GET endpoint: {}", uri);
                                return false;
                            }
                            return !endpoint.isPresent() || endpoint.get().equals(uri);
                        })
                .forEach(
                        counter -> {
                            String session = counter.getId().getTag("session");
                            if (session != null) {
                                uniqueUsers.add(session);
                            }
                        });
        return uniqueUsers.size();
    }

    private List<EndpointCount> getUniqueUserCounts(String method) {
        Map<String, Set<String>> uniqueUsers = new HashMap<>();
        meterRegistry
                .find("http.requests")
                .tag("method", method)
                .counters()
                .forEach(
                        counter -> {
                            String uri = counter.getId().getTag("uri");
                            String session = counter.getId().getTag("session");
                            if (uri != null && session != null) {
                                uniqueUsers.computeIfAbsent(uri, k -> new HashSet<>()).add(session);
                            }
                        });
        return uniqueUsers.entrySet().stream()
                .map(entry -> new EndpointCount(entry.getKey(), entry.getValue().size()))
                .sorted(Comparator.comparing(EndpointCount::getCount).reversed())
                .toList();
    }

    @GET
    @Path("/uptime")
    public Response getUptime() {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }
        LocalDateTime now = LocalDateTime.now();
        Duration uptime = Duration.between(StartupApplicationListener.startTime, now);
        return Response.ok(formatDuration(uptime)).build();
    }

    @GET
    @Path("/wau")
    @Operation(
            summary = "Weekly Active Users statistics",
            description =
                    "Returns WAU (Weekly Active Users) count and total unique browsers. "
                            + "Only available when security is disabled (no-login mode). "
                            + "Tracks unique browsers via client-generated UUID in localStorage.")
    public Response getWeeklyActiveUsers() {
        if (!metricsEnabled) {
            return Response.status(Response.Status.FORBIDDEN)
                    .entity("This endpoint is disabled.")
                    .build();
        }

        // Check if WAU service is available (only when security.enableLogin=false)
        if (wauService.isUnsatisfied()) {
            return Response.status(Response.Status.NOT_FOUND)
                    .entity(
                            "WAU tracking is only available when security is disabled (no-login mode)")
                    .build();
        }

        WeeklyActiveUsersService service = wauService.get();

        Map<String, Object> wauStats = new HashMap<>();
        wauStats.put("weeklyActiveUsers", service.getWeeklyActiveUsers());
        wauStats.put("totalUniqueBrowsers", service.getTotalUniqueBrowsers());
        wauStats.put("daysOnline", service.getDaysOnline());
        wauStats.put("trackingSince", service.getStartTime().toString());

        return Response.ok(wauStats).build();
    }

    private String formatDuration(Duration duration) {
        long days = duration.toDays();
        long hours = duration.toHoursPart();
        long minutes = duration.toMinutesPart();
        long seconds = duration.toSecondsPart();
        return String.format(Locale.ROOT, "%dd %dh %dm %ds", days, hours, minutes, seconds);
    }

    @Setter
    @Getter
    public static class EndpointCount {

        private String endpoint;

        private double count;

        public EndpointCount(String endpoint, double count) {
            this.endpoint = endpoint;
            this.count = count;
        }
    }
}
