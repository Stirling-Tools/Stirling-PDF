package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.EditorSource;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceDocCounter;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Turns a policy's referenced sources into runs: each {@code sourceId} is resolved live to its
 * persisted {@link Source}, then to an {@link InputSpec}. Triggers decide <em>when</em> and call
 * {@link #run(Policy)}; the controller uses the supplied-input and ad-hoc entry points. A {@link
 * SweepKind#FULL} sweep also reconciles the processed-file ledger against what is present.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class PolicyRunner {

    private final PolicyEngine policyEngine;
    private final List<InputSource> inputSources;
    private final SourceStore sourceStore;
    private final SourceDocCounter docCounter;
    private final ProcessedLedger processedLedger;

    /** Full-listing sweep: resolve every source, then reconcile the ledger. */
    public SweepOutcome run(Policy policy) {
        return run(policy, SweepKind.FULL);
    }

    /**
     * Trigger entry point. Pulls every referenced source; each yielded unit becomes its own run so
     * one failure does not affect the others. No sources means one run with no input (generator
     * pipeline). Missing or disabled sources are skipped so one broken reference does not stop the
     * rest. Returns the ids of the runs it started plus what the sweep skipped, so a manual trigger
     * can report which runs to follow or why nothing ran.
     */
    public SweepOutcome run(Policy policy, SweepKind sweep) {
        long sweepStart = System.currentTimeMillis();
        PolicySweep context = new PolicySweep(policy.id(), sweep, processedLedger);
        List<String> runIds = new ArrayList<>();
        List<String> sourceIds = policy.sourceIds();
        if (sourceIds.isEmpty()) {
            // Generator pipeline: one run with no input. Still fall through to the cleanup
            // below so rows recorded for its folder outputs are pruned like anything else,
            // instead of accumulating until the policy is deleted.
            runIds.add(startRun(policy, PolicyInputs.of(List.of()), unused -> {}));
        }
        for (String sourceId : sourceIds) {
            Source source = sourceStore.get(sourceId).orElse(null);
            if (source == null) {
                // No veto: a deleted source's rows should age out via the cleanup below.
                log.warn("Policy {} references missing source {}; skipping", policy.id(), sourceId);
                continue;
            }
            if (!source.enabled()) {
                log.debug(
                        "Source {} ({}) is disabled; skipping for policy {}",
                        sourceId,
                        source.name(),
                        policy.id());
                // Veto: a paused source's files cannot be stamped, so they must not be pruned.
                context.vetoCleanup();
                continue;
            }
            runIds.addAll(pullAndRun(policy, sourceId, source.toInputSpec(), context));
        }
        if (context.cleanupAllowed()) {
            processedLedger.markSeen(policy.id(), context.presentIdentities());
            int removed = processedLedger.deleteUnseen(policy.id(), sweepStart);
            if (removed > 0) {
                log.debug(
                        "Pruned {} ledger row(s) for files no longer present (policy {})",
                        removed,
                        policy.id());
            }
        }
        return context.outcome(runIds);
    }

    /**
     * Run a stored policy on caller-supplied files (e.g. an editor upload), bypassing its sources.
     * The supplied documents are still counted against the virtual {@link EditorSource}, scoped to
     * the policy's team, so the Sources overview reports the whole team's editor throughput.
     */
    public PolicyRunHandle runWith(
            Policy policy, PolicyInputs inputs, PolicyProgressListener listener) {
        PolicyRunHandle handle = policyEngine.runPolicy(policy, inputs, listener);
        docCounter.record(EditorSource.counterKey(policy.teamId()), inputs.primary().size());
        return handle;
    }

    /** Run an ad-hoc pipeline with no stored policy (AI/Automate one-offs). */
    public PolicyRunHandle runAdHoc(
            PipelineDefinition definition, PolicyInputs inputs, PolicyProgressListener listener) {
        return policyEngine.submit(definition, inputs, listener);
    }

    /**
     * Resolves the source and starts a run per unit; records how many documents the source fed and
     * returns the ids of the runs started. Any source that could not be listed completely vetoes
     * this sweep's ledger cleanup.
     */
    private List<String> pullAndRun(
            Policy policy, String sourceId, InputSpec spec, PolicySweep context) {
        InputSource source = sourceFor(spec);
        if (source == null) {
            log.warn(
                    "No input source for type '{}' (policy {}); skipping",
                    spec.type(),
                    policy.id());
            context.vetoCleanup();
            return List.of();
        }
        if (!source.listsExhaustively()) {
            context.vetoCleanup();
        }
        List<ResolvedInput> work;
        try {
            work = source.resolve(spec, context);
        } catch (IOException | RuntimeException e) {
            log.warn(
                    "Failed to resolve source '{}' for policy {}: {}",
                    spec.type(),
                    policy.id(),
                    e.getMessage());
            context.vetoCleanup();
            return List.of();
        }
        List<String> runIds = new ArrayList<>();
        long docsFed = 0;
        for (ResolvedInput unit : work) {
            runIds.add(startRun(policy, unit.inputs(), unit.onComplete()));
            docsFed += unit.inputs().primary().size();
        }
        docCounter.record(sourceId, docsFed);
        return runIds;
    }

    private String startRun(Policy policy, PolicyInputs inputs, Consumer<Boolean> onComplete) {
        log.info("Running policy {} ({})", policy.id(), policy.name());
        PolicyRunHandle handle =
                policyEngine.runPolicy(policy, inputs, PolicyProgressListener.NOOP);
        handle.completion()
                .whenComplete((run, throwable) -> onComplete.accept(succeeded(run, throwable)));
        return handle.runId();
    }

    private static boolean succeeded(PolicyRun run, Throwable throwable) {
        return throwable == null && run != null && run.getStatus() == PolicyRunStatus.COMPLETED;
    }

    private InputSource sourceFor(InputSpec spec) {
        return inputSources.stream()
                .filter(source -> source.supports(spec))
                .findFirst()
                .orElse(null);
    }
}
