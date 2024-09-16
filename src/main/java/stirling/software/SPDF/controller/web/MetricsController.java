package stirling.software.SPDF.controller.web;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.StartupApplicationListener;
import stirling.software.SPDF.model.ApplicationProperties;

@RestController
@RequestMapping("/api/v1/info")
@Tag(name = "Info", description = "Info APIs")
@Slf4j
public class MetricsController {

    @Autowired ApplicationProperties applicationProperties;

    private final MeterRegistry meterRegistry;

    private boolean metricsEnabled;

    @PostConstruct
    public void init() {
        Boolean metricsEnabled = applicationProperties.getMetrics().getEnabled();
        if (metricsEnabled == null) metricsEnabled = true;
        this.metricsEnabled = metricsEnabled;
    }

    @Autowired
    public MetricsController(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @GetMapping("/status")
    @Operation(
            summary = "Application status and version",
            description =
                    "This endpoint returns the status of the application and its version number.")
    public ResponseEntity<?> getStatus() {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }

        Map<String, String> status = new HashMap<>();
        status.put("status", "UP");
        status.put("version", getClass().getPackage().getImplementationVersion());
        return ResponseEntity.ok(status);
    }

    @GetMapping("/load")
    @Operation(
            summary = "GET request count",
            description =
                    "This endpoint returns the total count of GET requests for a specific endpoint or all endpoints.")
    public ResponseEntity<?> getPageLoads(
            @RequestParam(required = false, name = "endpoint") @Parameter(description = "endpoint")
                    Optional<String> endpoint) {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            double count = getRequestCount("GET", endpoint);
            return ResponseEntity.ok(count);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/load/unique")
    @Operation(
            summary = "Unique users count for GET requests",
            description =
                    "This endpoint returns the count of unique users for GET requests for a specific endpoint or all endpoints.")
    public ResponseEntity<?> getUniquePageLoads(
            @RequestParam(required = false, name = "endpoint") @Parameter(description = "endpoint")
                    Optional<String> endpoint) {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            double count = getUniqueUserCount("GET", endpoint);
            return ResponseEntity.ok(count);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/load/all")
    @Operation(
            summary = "GET requests count for all endpoints",
            description = "This endpoint returns the count of GET requests for each endpoint.")
    public ResponseEntity<?> getAllEndpointLoads() {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            List<EndpointCount> results = getEndpointCounts("GET");
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/load/all/unique")
    @Operation(
            summary = "Unique users count for GET requests for all endpoints",
            description =
                    "This endpoint returns the count of unique users for GET requests for each endpoint.")
    public ResponseEntity<?> getAllUniqueEndpointLoads() {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            List<EndpointCount> results = getUniqueUserCounts("GET");
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/requests")
    @Operation(
            summary = "POST request count",
            description =
                    "This endpoint returns the total count of POST requests for a specific endpoint or all endpoints.")
    public ResponseEntity<?> getTotalRequests(
            @RequestParam(required = false, name = "endpoint") @Parameter(description = "endpoint")
                    Optional<String> endpoint) {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            double count = getRequestCount("POST", endpoint);
            return ResponseEntity.ok(count);
        } catch (Exception e) {
            return ResponseEntity.ok(-1);
        }
    }

    @GetMapping("/requests/unique")
    @Operation(
            summary = "Unique users count for POST requests",
            description =
                    "This endpoint returns the count of unique users for POST requests for a specific endpoint or all endpoints.")
    public ResponseEntity<?> getUniqueTotalRequests(
            @RequestParam(required = false, name = "endpoint") @Parameter(description = "endpoint")
                    Optional<String> endpoint) {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            double count = getUniqueUserCount("POST", endpoint);
            return ResponseEntity.ok(count);
        } catch (Exception e) {
            return ResponseEntity.ok(-1);
        }
    }

    @GetMapping("/requests/all")
    @Operation(
            summary = "POST requests count for all endpoints",
            description = "This endpoint returns the count of POST requests for each endpoint.")
    public ResponseEntity<?> getAllPostRequests() {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            List<EndpointCount> results = getEndpointCounts("POST");
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/requests/all/unique")
    @Operation(
            summary = "Unique users count for POST requests for all endpoints",
            description =
                    "This endpoint returns the count of unique users for POST requests for each endpoint.")
    public ResponseEntity<?> getAllUniquePostRequests() {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            List<EndpointCount> results = getUniqueUserCounts("POST");
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private double getRequestCount(String method, Optional<String> endpoint) {
        log.info(
                "Getting request count for method: {}, endpoint: {}",
                method,
                endpoint.orElse("all"));
        double count =
                meterRegistry.find("http.requests").tag("method", method).counters().stream()
                        .filter(
                                counter ->
                                        !endpoint.isPresent()
                                                || endpoint.get()
                                                        .equals(counter.getId().getTag("uri")))
                        .mapToDouble(Counter::count)
                        .sum();
        log.info("Request count: {}", count);
        return count;
    }

    private List<EndpointCount> getEndpointCounts(String method) {
        log.info("Getting endpoint counts for method: {}", method);
        Map<String, Double> counts = new HashMap<>();
        meterRegistry
                .find("http.requests")
                .tag("method", method)
                .counters()
                .forEach(
                        counter -> {
                            String uri = counter.getId().getTag("uri");
                            counts.merge(uri, counter.count(), Double::sum);
                        });

        List<EndpointCount> result =
                counts.entrySet().stream()
                        .map(entry -> new EndpointCount(entry.getKey(), entry.getValue()))
                        .sorted(Comparator.comparing(EndpointCount::getCount).reversed())
                        .collect(Collectors.toList());
        log.info("Found {} endpoints with counts", result.size());
        return result;
    }

    private double getUniqueUserCount(String method, Optional<String> endpoint) {
        log.info(
                "Getting unique user count for method: {}, endpoint: {}",
                method,
                endpoint.orElse("all"));
        Set<String> uniqueUsers = new HashSet<>();
        meterRegistry.find("http.requests").tag("method", method).counters().stream()
                .filter(
                        counter ->
                                !endpoint.isPresent()
                                        || endpoint.get().equals(counter.getId().getTag("uri")))
                .forEach(
                        counter -> {
                            String session = counter.getId().getTag("session");
                            if (session != null) {
                                uniqueUsers.add(session);
                            }
                        });
        log.info("Unique user count: {}", uniqueUsers.size());
        return uniqueUsers.size();
    }

    private List<EndpointCount> getUniqueUserCounts(String method) {
        log.info("Getting unique user counts for method: {}", method);
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

        List<EndpointCount> result =
                uniqueUsers.entrySet().stream()
                        .map(entry -> new EndpointCount(entry.getKey(), entry.getValue().size()))
                        .sorted(Comparator.comparing(EndpointCount::getCount).reversed())
                        .collect(Collectors.toList());

        log.info("Found {} endpoints with unique user counts", result.size());
        return result;
    }

    public static class EndpointCount {
        private String endpoint;
        private double count;

        public EndpointCount(String endpoint, double count) {
            this.endpoint = endpoint;
            this.count = count;
        }

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        public double getCount() {
            return count;
        }

        public void setCount(double count) {
            this.count = count;
        }
    }

    @GetMapping("/uptime")
    public ResponseEntity<?> getUptime() {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }

        LocalDateTime now = LocalDateTime.now();
        Duration uptime = Duration.between(StartupApplicationListener.startTime, now);
        return ResponseEntity.ok(formatDuration(uptime));
    }

    private String formatDuration(Duration duration) {
        long days = duration.toDays();
        long hours = duration.toHoursPart();
        long minutes = duration.toMinutesPart();
        long seconds = duration.toSecondsPart();
        return String.format("%dd %dh %dm %ds", days, hours, minutes, seconds);
    }
}
