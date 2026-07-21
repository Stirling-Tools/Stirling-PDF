package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.WaitState;

/**
 * Tests for {@link PolicyRunRegistry} eviction: terminal runs expire, active/paused runs persist.
 */
class PolicyRunRegistryTest {

    private PolicyRunRegistry registry;

    @BeforeEach
    void setUp() {
        registry = new PolicyRunRegistry(new ApplicationProperties());
    }

    @AfterEach
    void tearDown() {
        registry.shutdown();
    }

    @Test
    void evictsTerminalRunsPastTheCutoff() {
        PolicyRun completed = register("completed");
        completed.complete(List.of());
        PolicyRun failed = register("failed");
        failed.fail("boom");
        PolicyRun cancelled = register("cancelled");
        cancelled.cancel();

        // A cutoff in the future means every terminal run finished "before" it.
        int removed = registry.evictExpired(Instant.now().plusSeconds(60));

        assertEquals(3, removed);
        assertNull(registry.get("completed"));
        assertNull(registry.get("failed"));
        assertNull(registry.get("cancelled"));
    }

    @Test
    void retainsActiveAndPausedRunsRegardlessOfAge() {
        register("pending"); // PENDING: never started
        PolicyRun running = register("running");
        running.markRunning();
        PolicyRun waiting = register("waiting");
        waiting.waitForInput(new WaitState("needs a signature", 1, List.of()));

        int removed = registry.evictExpired(Instant.now().plusSeconds(60));

        assertEquals(0, removed);
        assertNotNull(registry.get("pending"));
        assertNotNull(registry.get("running"));
        assertNotNull(registry.get("waiting"));
    }

    @Test
    void keepsTerminalRunsStillWithinTheExpiryWindow() {
        PolicyRun completed = register("recent");
        completed.complete(List.of());

        // A cutoff in the past means the run was updated "after" it: too young to evict.
        int removed = registry.evictExpired(Instant.now().minusSeconds(60));

        assertEquals(0, removed);
        assertNotNull(registry.get("recent"));
    }

    @Test
    void evictionLeavesUnrelatedRunsInPlace() {
        PolicyRun completed = register("done");
        completed.complete(List.of());
        PolicyRun running = register("busy");
        running.markRunning();

        registry.evictExpired(Instant.now().plusSeconds(60));

        assertNull(registry.get("done"));
        assertNotNull(registry.get("busy"));
        assertTrue(registry.all().stream().anyMatch(r -> r.getRunId().equals("busy")));
    }

    private PolicyRun register(String runId) {
        PolicyRun run = new PolicyRun(runId, null, new PipelineDefinition(runId, List.of(), null));
        registry.register(run);
        return run;
    }
}
