package stirling.software.SPDF.controller.web;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.config.StartupApplicationListener;
import stirling.software.SPDF.model.ApplicationProperties;

@RestController
@RequestMapping("/api/v1/info")
@Tag(name = "Info", description = "Info APIs")
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

    @GetMapping("/loads")
    @Operation(
            summary = "GET request count",
            description =
                    "This endpoint returns the total count of GET requests or the count of GET requests for a specific endpoint.")
    public ResponseEntity<?> getPageLoads(
            @RequestParam(required = false, name = "endpoint") @Parameter(description = "endpoint")
                    Optional<String> endpoint) {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {

            double count = 0.0;

            for (Meter meter : meterRegistry.getMeters()) {
                if (meter.getId().getName().equals("http.requests")) {
                    String method = meter.getId().getTag("method");
                    if (method != null && "GET".equals(method)) {

                        if (endpoint.isPresent() && !endpoint.get().isBlank()) {
                            if (!endpoint.get().startsWith("/")) {
                                endpoint = Optional.of("/" + endpoint.get());
                            }
                            System.out.println(
                                    "loads "
                                            + endpoint.get()
                                            + " vs "
                                            + meter.getId().getTag("uri"));
                            if (endpoint.get().equals(meter.getId().getTag("uri"))) {
                                if (meter instanceof Counter) {
                                    count += ((Counter) meter).count();
                                }
                            }
                        } else {
                            if (meter instanceof Counter) {
                                count += ((Counter) meter).count();
                            }
                        }
                    }
                }
            }

            return ResponseEntity.ok(count);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/loads/all")
    @Operation(
            summary = "GET requests count for all endpoints",
            description = "This endpoint returns the count of GET requests for each endpoint.")
    public ResponseEntity<?> getAllEndpointLoads() {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            Map<String, Double> counts = new HashMap<>();

            for (Meter meter : meterRegistry.getMeters()) {
                if (meter.getId().getName().equals("http.requests")) {
                    String method = meter.getId().getTag("method");
                    if (method != null && "GET".equals(method)) {
                        String uri = meter.getId().getTag("uri");
                        if (uri != null) {
                            double currentCount = counts.getOrDefault(uri, 0.0);
                            if (meter instanceof Counter) {
                                currentCount += ((Counter) meter).count();
                            }
                            counts.put(uri, currentCount);
                        }
                    }
                }
            }

            List<EndpointCount> results =
                    counts.entrySet().stream()
                            .map(entry -> new EndpointCount(entry.getKey(), entry.getValue()))
                            .sorted(Comparator.comparing(EndpointCount::getCount).reversed())
                            .collect(Collectors.toList());

            return ResponseEntity.ok(results);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    public class EndpointCount {
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

    @GetMapping("/requests")
    @Operation(
            summary = "POST request count",
            description =
                    "This endpoint returns the total count of POST requests or the count of POST requests for a specific endpoint.")
    public ResponseEntity<?> getTotalRequests(
            @RequestParam(required = false, name = "endpoint") @Parameter(description = "endpoint")
                    Optional<String> endpoint) {
        if (!metricsEnabled) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("This endpoint is disabled.");
        }
        try {
            double count = 0.0;

            for (Meter meter : meterRegistry.getMeters()) {
                if (meter.getId().getName().equals("http.requests")) {
                    String method = meter.getId().getTag("method");
                    if (method != null && "POST".equals(method)) {
                        if (endpoint.isPresent() && !endpoint.get().isBlank()) {
                            if (!endpoint.get().startsWith("/")) {
                                endpoint = Optional.of("/" + endpoint.get());
                            }
                            if (endpoint.get().equals(meter.getId().getTag("uri"))) {
                                if (meter instanceof Counter) {
                                    count += ((Counter) meter).count();
                                }
                            }
                        } else {
                            if (meter instanceof Counter) {
                                count += ((Counter) meter).count();
                            }
                        }
                    }
                }
            }
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
            Map<String, Double> counts = new HashMap<>();

            for (Meter meter : meterRegistry.getMeters()) {
                if (meter.getId().getName().equals("http.requests")) {
                    String method = meter.getId().getTag("method");
                    if (method != null && "POST".equals(method)) {
                        String uri = meter.getId().getTag("uri");
                        if (uri != null) {
                            double currentCount = counts.getOrDefault(uri, 0.0);
                            if (meter instanceof Counter) {
                                currentCount += ((Counter) meter).count();
                            }
                            counts.put(uri, currentCount);
                        }
                    }
                }
            }

            List<EndpointCount> results =
                    counts.entrySet().stream()
                            .map(entry -> new EndpointCount(entry.getKey(), entry.getValue()))
                            .sorted(Comparator.comparing(EndpointCount::getCount).reversed())
                            .collect(Collectors.toList());

            return ResponseEntity.ok(results);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
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
