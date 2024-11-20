package stirling.software.SPDF.service;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.search.Search;

@Service
public class MetricsAggregatorService {

    private final MeterRegistry meterRegistry;
    private final PostHogService postHogService;
    private final Map<String, Double> lastSentMetrics = new ConcurrentHashMap<>();

    @Autowired
    public MetricsAggregatorService(MeterRegistry meterRegistry, PostHogService postHogService) {
        this.meterRegistry = meterRegistry;
        this.postHogService = postHogService;
    }

    @Scheduled(fixedRate = 900000) // Run every 15 minutes
    public void aggregateAndSendMetrics() {
        Map<String, Object> metrics = new HashMap<>();
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
                
                            String key = String.format(
                                "http_requests_%s_%s",
                                method,
                                uri.replace("/", "_")
                            );

                            double currentCount = counter.count();
                            double lastCount = lastSentMetrics.getOrDefault(key, 0.0);
                            double difference = currentCount - lastCount;

                            if (difference > 0) {
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
