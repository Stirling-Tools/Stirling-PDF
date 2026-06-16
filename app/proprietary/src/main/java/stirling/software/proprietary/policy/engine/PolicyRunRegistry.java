package stirling.software.proprietary.policy.engine;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.model.PolicyRun;

/**
 * In-memory store of live {@link PolicyRun} state, keyed by runId. Holds the authoritative run
 * state machine; durable status/files for download are projected separately into {@code
 * TaskManager}.
 *
 * <p>Finished runs are evicted on a fixed interval once they age past {@code
 * policies.runExpiryMinutes}, mirroring the job-result expiry in {@code TaskManager} so a run's
 * rich in-memory state does not outlive the process. Only terminal runs are evicted; active and
 * paused ({@code WAITING_FOR_INPUT}) runs are retained regardless of age. Result files are not
 * touched here: a run shares its runId with a {@code TaskManager} job, which owns file-lifecycle
 * cleanup, so eviction only frees this map's entry.
 */
@Slf4j
@Service
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

    /** Scheduled hook: evict terminal runs that finished before the expiry window. */
    private void evictExpiredRuns() {
        try {
            evictExpired(Instant.now().minus(runExpiry));
        } catch (Exception e) {
            log.error("Error during policy run cleanup: {}", e.getMessage(), e);
        }
    }

    /**
     * Remove every terminal run last updated before {@code cutoff}; active and paused runs are kept
     * regardless of age. Returns the number evicted. Package-visible so the scheduled sweep and
     * tests exercise the same path with an explicit cutoff.
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
