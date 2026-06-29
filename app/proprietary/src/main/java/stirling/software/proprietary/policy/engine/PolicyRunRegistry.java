package stirling.software.proprietary.policy.engine;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.model.PolicyRun;

/**
 * In-memory store of live {@link PolicyRun} state, keyed by runId. Authoritative run state machine;
 * durable status/files are projected separately into {@code TaskManager}.
 *
 * <p>A scheduled sweep evicts only terminal runs aged past {@code policies.runExpiryMinutes};
 * active and paused runs are kept regardless of age. Eviction frees only this map's entry: the
 * shared {@code TaskManager} job owns file-lifecycle cleanup.
 */
@Slf4j
@Service
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class PolicyRunRegistry {

    private final Map<String, PolicyRun> runs = new ConcurrentHashMap<>();

    private final Duration runExpiry;
    private final ScheduledExecutorService cleanupExecutor =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofVirtual().name("policy-run-cleanup-", 0).factory());

    public PolicyRunRegistry(ApplicationProperties applicationProperties) {
        int runExpiryMinutes = applicationProperties.getPolicies().getRunExpiryMinutes();
        this.runExpiry = Duration.ofMinutes(runExpiryMinutes);
        cleanupExecutor.scheduleAtFixedRate(this::evictExpiredRuns, 10, 10, TimeUnit.MINUTES);
        log.debug(
                "Policy run registry initialized with run expiry of {} minutes", runExpiryMinutes);
    }

    public void register(PolicyRun run) {
        runs.put(run.getRunId(), run);
    }

    public PolicyRun get(String runId) {
        return runs.get(runId);
    }

    public Collection<PolicyRun> all() {
        return runs.values();
    }

    /** Scheduled sweep entry point. */
    private void evictExpiredRuns() {
        try {
            evictExpired(Instant.now().minus(runExpiry));
        } catch (Exception e) {
            log.error("Error during policy run cleanup: {}", e.getMessage(), e);
        }
    }

    /**
     * Evict terminal runs last updated before {@code cutoff}, returning the count. Package-visible
     * so the sweep and tests share one path with an explicit cutoff.
     */
    int evictExpired(Instant cutoff) {
        int removed = 0;
        for (Map.Entry<String, PolicyRun> entry : runs.entrySet()) {
            PolicyRun run = entry.getValue();
            if (run.getStatus().isTerminal() && run.getUpdatedAt().isBefore(cutoff)) {
                runs.remove(entry.getKey());
                removed++;
            }
        }
        if (removed > 0) {
            log.info("Evicted {} expired policy runs", removed);
        }
        return removed;
    }

    @PreDestroy
    void shutdown() {
        cleanupExecutor.shutdownNow();
    }
}
