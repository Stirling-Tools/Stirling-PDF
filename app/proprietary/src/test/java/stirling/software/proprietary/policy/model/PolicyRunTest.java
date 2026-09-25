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
                "run-1",
                "p1",
                new PipelineDefinition("t", List.of(), List.of()),
                null,
                null,
                null,
                null);
    }

    @Test
    void externalDeliveryIsCapturedInTheRunView() {
        PolicyRun run =
                new PolicyRun(
                        "run",
                        "policy",
                        new PipelineDefinition(
                                "copy", List.of(), List.of(OutputSpec.folder("/out"))),
                        null,
                        null,
                        null,
                        null);
        assertTrue(PolicyRunView.of(run).externalOutput());
        assertFalse(PolicyRunView.of(run()).externalOutput());
    }

    @Test
    void routedExternalDeliveryIsCapturedEvenWithAnInlineFallback() {
        var condition =
                new stirling.software.proprietary.document.conditions.Condition.MatchesAny(
                        new stirling.software.proprietary.document.conditions.ConditionInput
                                .DocumentField("document.extension"),
                        List.of("pdf"));
        for (OutputSpec destination : List.of(OutputSpec.inline(), OutputSpec.folder("/out"))) {
            PolicyRun routed =
                    new PolicyRun(
                            "run",
                            "policy",
                            new PipelineDefinition(
                                    "route",
                                    List.of(),
                                    List.of(OutputSpec.inline()),
                                    List.of(
                                            new RoutedDestination(
                                                    new RoutingRule(condition, "destination"),
                                                    destination))),
                            null,
                            null,
                            null,
                            null);
            assertEquals(
                    !"inline".equals(destination.type()),
                    PolicyRunView.of(routed).externalOutput());
        }
    }

    @Test
    void sharedJobProjectionPreservesExternalDelivery() {
        var entry =
                new stirling.software.common.cluster.JobStoreEntry(
                        "run",
                        stirling.software.common.cluster.JobStoreEntry.JobState.COMPLETE,
                        "node-a",
                        java.time.Instant.now(),
                        null,
                        null,
                        List.of("receipt"),
                        java.util.Map.of("policyId", "policy", "externalOutput", "true"));
        assertTrue(PolicyRunView.ofEntry(entry).externalOutput());
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
