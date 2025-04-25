package stirling.software.SPDF.service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.search.Search;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.EndpointInspector;

@Service
@RequiredArgsConstructor
public class MetricsAggregatorService {
    private static final Logger logger = LoggerFactory.getLogger(MetricsAggregatorService.class);

    private final MeterRegistry meterRegistry;
    private final PostHogService postHogService;
    private final EndpointInspector endpointInspector;
    private final Map<String, Double> lastSentMetrics = new ConcurrentHashMap<>();

    @Scheduled(fixedRate = 7200000) // Run every 2 hours
    public void aggregateAndSendMetrics() {
        Map<String, Object> metrics = new HashMap<>();

        final boolean validateGetEndpoints = endpointInspector.getValidGetEndpoints().size() != 0;
        Search.in(meterRegistry)
                .name("http.requests")
                .counters()
                .forEach(
                        counter -> {
                            String method = counter.getId().getTag("method");
                            String uri = counter.getId().getTag("uri");
                            // Skip if either method or uri is null
                            if (method == null || uri == null) {
                                return;
                            }

                            // Skip URIs that are 2 characters or shorter
                            if (uri.length() <= 2) {
                                return;
                            }

                            // Skip non-GET and non-POST requests
                            if (!"GET".equals(method) && !"POST".equals(method)) {
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
                            if ("GET".equals(method)
                                    && validateGetEndpoints
                                    && !endpointInspector.isValidGetEndpoint(uri)) {
                                logger.debug("Skipping invalid GET endpoint: {}", uri);
                                return;
                            }

                            String key =
                                    String.format(
                                            "http_requests_%s_%s", method, uri.replace("/", "_"));
                            double currentCount = counter.count();
                            double lastCount = lastSentMetrics.getOrDefault(key, 0.0);
                            double difference = currentCount - lastCount;
                            if (difference > 0) {
                                logger.info("{}, {}", key, difference);
                                metrics.put(key, difference);
                                lastSentMetrics.put(key, currentCount);
                            }
                        });
        // Send aggregated metrics to PostHog
        if (!metrics.isEmpty()) {

            postHogService.captureEvent("aggregated_metrics", metrics);
        }
    }
}
