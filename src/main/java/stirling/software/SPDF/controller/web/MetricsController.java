package stirling.software.SPDF.controller.web;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "API", description = "Info APIs")
public class MetricsController {

    private final MeterRegistry meterRegistry;

    public MetricsController(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @GetMapping("/status")
    @Operation(summary = "Application status and version",
            description = "This endpoint returns the status of the application and its version number.")
    public Map<String, String> getStatus() {
        Map<String, String> status = new HashMap<>();
        status.put("status", "UP");
        status.put("version", getClass().getPackage().getImplementationVersion());
        return status;
    }
    
    @GetMapping("/loads")
    @Operation(summary = "GET request count",
            description = "This endpoint returns the total count of GET requests or the count of GET requests for a specific endpoint.")
    public Double getPageLoads(@RequestParam Optional<String> endpoint) {
        try {
            double count = 0.0;

            for (Meter meter : meterRegistry.getMeters()) {
                if (meter.getId().getName().equals("http.requests")) {
                    String method = meter.getId().getTag("method");
                    if (method != null && method.equals("GET")) {
                        if (meter instanceof Counter) {
                            count += ((Counter) meter).count();
                        }
                    }
                }
            }

            return count;
        } catch (Exception e) {
            return -1.0;
        }
    }

    @GetMapping("/requests")
    @Operation(summary = "POST request count",
            description = "This endpoint returns the total count of POST requests or the count of POST requests for a specific endpoint.")
    public Double getTotalRequests(@RequestParam Optional<String> endpoint) {
        try {
            Counter counter;
            if (endpoint.isPresent()) {
                counter = meterRegistry.get("http.requests")
                    .tags("method", "POST", "uri", endpoint.get()).counter();
            } else {
                counter = meterRegistry.get("http.requests")
                    .tags("method", "POST").counter();
            }
            return counter.count();
        } catch (Exception e) {
            return -1.0;
        }
        
    }

}
