package stirling.software.SPDF.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;
import java.util.stream.Collectors;

@Slf4j
@Service
public class UsageMetricsService {

    private final Map<String, LongAdder> globalCounts = new ConcurrentHashMap<>();

    // toolName -> userName -> count
    private final Map<String, Map<String, LongAdder>> perUserCounts = new ConcurrentHashMap<>();

    private final ObjectMapper mapper = new ObjectMapper();
    private final File statsFile = new File("configs/usage-stats.json");

    public void recordUsage(String toolName, String username) {
        // global
        globalCounts.computeIfAbsent(toolName, k -> new LongAdder()).increment();

        // per–user
        if (username != null && !username.isBlank()) {
            perUserCounts
                .computeIfAbsent(toolName, k -> new ConcurrentHashMap<>())
                .computeIfAbsent(username, k -> new LongAdder())
                .increment();
        }
    }

    // optional getters if you want to expose stats later
    public Map<String, Long> getGlobalCounts() {
        return globalCounts.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().sum()));
    }

    @Scheduled(fixedDelay = 60_000)
    public void persistStats() {
        try {
            Map<String, Object> dto = Map.of(
                "global", getGlobalCounts(),
                "perUser", perUserCounts.entrySet().stream()
                    .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> e.getValue().entrySet().stream()
                                .collect(Collectors.toMap(
                                    Map.Entry::getKey, x -> x.getValue().sum()
                                ))
                    ))
            );
            statsFile.getParentFile().mkdirs();
            mapper.writerWithDefaultPrettyPrinter().writeValue(statsFile, dto);
        } catch (IOException e) {
            log.warn("Failed to persist usage stats", e);
        }
    }
}
