package stirling.software.proprietary.policy.engine;

import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.model.PolicyRun;

/**
 * In-memory store of live {@link PolicyRun} state, keyed by runId. Holds the authoritative run
 * state machine; durable status/files for download are projected separately into {@code
 * TaskManager}.
 *
 * <p>Stage 1 keeps every run for the process lifetime. Expiry/cleanup (mirroring {@code
 * TaskManager}'s job expiry) is added during hardening.
 */
@Service
public class PolicyRunRegistry {

    private final Map<String, PolicyRun> runs = new ConcurrentHashMap<>();

    public void register(PolicyRun run) {
        runs.put(run.getRunId(), run);
    }

    public PolicyRun get(String runId) {
        return runs.get(runId);
    }

    public Collection<PolicyRun> all() {
        return runs.values();
    }
}
