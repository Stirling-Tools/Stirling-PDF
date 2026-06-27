package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Tests for {@link PolicyRunner}: the one place that turns a policy's sources into runs. Verifies
 * it pulls every source, runs one job per unit of work, feeds each unit's completion hook the run
 * outcome, and that a generator (no sources) still runs once.
 */
@ExtendWith(MockitoExtension.class)
class PolicyRunnerTest {

    @Mock private PolicyEngine policyEngine;
    @Mock private InputSource folderSource;

    private final SourceStore sourceStore = new InProcessSourceStore();
    private PolicyRunner runner;

    @BeforeEach
    void setUp() {
        runner = new PolicyRunner(policyEngine, List.of(folderSource), sourceStore);
    }

    @Test
    void runsOnceWithNoFilesWhenThePolicyHasNoSources() {
        Policy policy = policy(List.of());
        when(policyEngine.runPolicy(eq(policy), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        ArgumentCaptor<PolicyInputs> inputs = ArgumentCaptor.forClass(PolicyInputs.class);
        verify(policyEngine).runPolicy(eq(policy), inputs.capture(), any());
        assertTrue(inputs.getValue().primary().isEmpty());
    }

    @Test
    void pullsEverySourceAndRunsOnePerUnitOfWork() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(spec))
                .thenReturn(
                        List.of(
                                ResolvedInput.of(PolicyInputs.of(List.of())),
                                ResolvedInput.of(PolicyInputs.of(List.of()))));
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

        runner.run(policy);

        verify(policyEngine, times(2)).runPolicy(eq(policy), any(), any());
    }

    @Test
    void feedsEachUnitsCompletionHookTheRunOutcome() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        AtomicBoolean outcome = new AtomicBoolean(false);
        ResolvedInput unit = new ResolvedInput(PolicyInputs.of(List.of()), outcome::set);
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(spec)).thenReturn(List.of(unit));
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", completion));

        runner.run(policy);

        PolicyRun run = mock(PolicyRun.class);
        when(run.getStatus()).thenReturn(PolicyRunStatus.COMPLETED);
        completion.complete(run);

        assertTrue(outcome.get());
    }

    @Test
    void reportsFailureToTheCompletionHookWhenTheRunDoesNotComplete() throws Exception {
        InputSpec spec = InputSpec.folder("/in");
        Policy policy = policy(List.of(spec));
        AtomicBoolean outcome = new AtomicBoolean(true);
        ResolvedInput unit = new ResolvedInput(PolicyInputs.of(List.of()), outcome::set);
        when(folderSource.supports(spec)).thenReturn(true);
        when(folderSource.resolve(spec)).thenReturn(List.of(unit));
        CompletableFuture<PolicyRun> completion = new CompletableFuture<>();
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r", completion));

        runner.run(policy);
        completion.completeExceptionally(new RuntimeException("boom"));

        assertFalse(outcome.get());
    }

    @Test
    void skipsSourcesWithNoMatchingBean() {
        InputSpec spec = new InputSpec("s3", Map.of());
        Policy policy = policy(List.of(spec));
        when(folderSource.supports(spec)).thenReturn(false);

        runner.run(policy);

        verifyNoInteractions(policyEngine);
    }

    @Test
    void runWithSuppliedInputsBypassesSources() {
        Policy policy = policy(List.of(InputSpec.folder("/in")));
        PolicyInputs inputs = PolicyInputs.of(List.of());
        PolicyRunHandle handle = new PolicyRunHandle("r", new CompletableFuture<>());
        when(policyEngine.runPolicy(policy, inputs, PolicyProgressListener.NOOP))
                .thenReturn(handle);

        assertSame(handle, runner.runWith(policy, inputs, PolicyProgressListener.NOOP));
        verifyNoInteractions(folderSource);
    }

    /** Persists each spec as a source and returns a policy referencing them by id. */
    private Policy policy(List<InputSpec> sources) {
        List<String> sourceIds =
                sources.stream().map(spec -> sourceStore.save(sourceFrom(spec)).id()).toList();
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                null,
                sourceIds,
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }

    private static Source sourceFrom(InputSpec spec) {
        return new Source(null, "src", spec.type(), spec.options(), true, "owner", null);
    }
}
