package stirling.software.proprietary.policy.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Cancellation is sticky: a cancelled run can neither restart nor report an outcome, so a revert
 * that cancelled it can trust the run to stay cancelled.
 */
class PolicyRunTest {

    private static PolicyRun run() {
        return new PolicyRun(
                "run-1", "p1", new PipelineDefinition("t", List.of(), List.of()), null, null, null);
    }

    @Test
    void aCancelledRunCannotStart() {
        PolicyRun run = run();
        assertTrue(run.cancel());
        assertFalse(run.markRunning());
        assertEquals(PolicyRunStatus.CANCELLED, run.getStatus());
    }

    @Test
    void aCancelledRunKeepsItsStatusThroughCompleteAndFail() {
        PolicyRun run = run();
        assertTrue(run.markRunning());
        assertTrue(run.cancel());
        run.complete(List.of());
        assertEquals(PolicyRunStatus.CANCELLED, run.getStatus());
        run.fail("late failure");
        assertEquals(PolicyRunStatus.CANCELLED, run.getStatus());
    }

    @Test
    void anOrdinaryRunStillCompletes() {
        PolicyRun run = run();
        assertTrue(run.markRunning());
        run.complete(List.of());
        assertEquals(PolicyRunStatus.COMPLETED, run.getStatus());
    }
}
