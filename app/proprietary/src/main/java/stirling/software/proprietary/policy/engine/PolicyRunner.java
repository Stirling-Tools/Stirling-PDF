package stirling.software.proprietary.policy.engine;

import java.io.IOException;
import java.nio.file.FileSystemException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Semaphore;
import java.util.function.Consumer;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.failure.FailureKind;
import stirling.software.proprietary.failure.PolicyFailureRecorder;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.input.ResolvedInput;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.EditorSource;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceDocCounter;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.security.configuration.ee.DatabaseLicenseGuard;

/**
 * Turns a policy's referenced sources into runs: each {@code sourceId} is resolved live to its
 * persisted {@link Source}, then to an {@link InputSpec}. Triggers decide <em>when</em> and call
 * {@link #run(Policy)}; the controller uses the supplied-input and ad-hoc entry points. A {@link
 * SweepKind#FULL} sweep also reconciles the processed-file ledger against what is present.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyRunner {

    private final PolicyEngine policyEngine;
    private final List<InputSource> inputSources;
    private final SourceStore sourceStore;
    private final SourceDocCounter docCounter;
    private final ProcessedLedger processedLedger;
    private final ApplicationProperties applicationProperties;
    private final PolicyAccessGuard policyAccessGuard;
    private final DatabaseLicenseGuard databaseLicenseGuard;
    private final PolicyFailureRecorder failureRecorder;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * One admission gate per sweep: every run is visible immediately, but only this many execute at
     * once, so completions arrive steadily from the first file onward.
     */
    private Semaphore sweepAdmission() {
        int concurrency = applicationProperties.getPolicies().getSweepConcurrency();
        return concurrency > 0 ? new Semaphore(concurrency) : null;
    }

    /** Full-listing sweep over every input: resolve each source, then reconcile the ledger. */
    public SweepOutcome run(Policy policy) {
        return run(policy, SweepKind.FULL);
    }

    /** Sweep every input of the policy at the given listing depth. */
    public SweepOutcome run(Policy policy, SweepKind sweep) {
        return run(policy, policy.inputs(), sweep);
    }

    /**
     * Fire one input binding: a background trigger pulling its own source without touching the
     * policy's other inputs. Never reconciles the ledger (it sees a single source, so pruning would
     * wrongly forget the rest); a full-policy sweep handles that.
     */
    public SweepOutcome runInput(Policy policy, PipelineInput input, SweepKind sweep) {
        return run(policy, List.of(input), sweep);
    }

    /**
     * Run one named file of the policy and nothing else: a per-file retry, where claiming the
     * folder's other files would process work the user did not ask for - including an original they
     * just restored, whose ledger row the restore deliberately forgot.
     */
    public SweepOutcome runFile(Policy policy, String identity) {
        return run(policy, policy.inputs(), SweepKind.LIGHT, identity);
    }

    /** Sweep every one of the given inputs, claiming whatever each source offers. */
    public SweepOutcome run(Policy policy, List<PipelineInput> inputs, SweepKind sweep) {
        return run(policy, inputs, sweep, null);
    }

    /**
     * Core sweep: pulls each of the given inputs' sources; each yielded unit becomes its own run so
     * one failure does not affect the others. No inputs means one run with no input (generator
     * pipeline). Missing or disabled sources are skipped so one broken reference does not stop the
     * rest. Presence cleanup only runs when the sweep covered every input of the policy - a
     * single-binding fire cannot reconcile the whole policy's ledger. A non-null {@code target}
     * narrows the sweep to that one ledger identity. Returns the ids of the runs it started plus
     * what the sweep skipped, so a manual trigger can report which runs to follow or why nothing
     * ran.
     */
    private SweepOutcome run(
            Policy policy, List<PipelineInput> inputs, SweepKind sweep, String target) {
        if (databaseLicenseGuard.requiresActivation()) {
            return new SweepOutcome(List.of(), 0, 0, 0, 0, 0);
        }
        if (policyAccessGuard.isOrphaned(policy)) {
            // Reachable by nobody, so nobody could stop it: running would replace files in place
            // in a folder no user can list, pause, revert, or delete.
            log.warn("Processing folder {} has no reachable owner; not sweeping it", policy.id());
            return new SweepOutcome(List.of(), 0, 0, 0, 0, 0);
        }
        long sweepStart = System.currentTimeMillis();
        PolicySweep context = new PolicySweep(policy.id(), sweep, processedLedger, target);
        Semaphore admission = sweepAdmission();
        List<String> runIds = new ArrayList<>();
        if (inputs.isEmpty()) {
            // Generator pipeline: one run with no input, so neither a source nor a document to
            // attribute to. Still falls through to the cleanup below, so rows recorded for its
            // folder outputs are pruned instead of accumulating until the policy is deleted.
            runIds.add(
                    startRun(
                                    policy,
                                    null,
                                    null,
                                    PolicyInputs.of(List.of()),
                                    unused -> {},
                                    admission)
                            .runId());
        }
        for (PipelineInput input : inputs) {
            String sourceId = input.sourceId();
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
            if (policyAccessGuard.isOrphaned(source)) {
                log.warn("Source {} has no reachable owner; not sweeping it", sourceId);
                context.vetoCleanup();
                continue;
            }
            runIds.addAll(pullAndRun(policy, source, context, admission));
        }
        boolean fullPolicy = inputs.size() == policy.inputs().size();
        if (fullPolicy && context.cleanupAllowed()) {
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
     *
     * @param documentReference the caller's own opaque reference to the single document it runs on,
     *     or null when it supplied none or several. Passed through untouched.
     */
    public PolicyRunHandle runWith(
            Policy policy,
            PolicyInputs inputs,
            PolicyProgressListener listener,
            String documentReference) {
        requireDatabaseAccess();
        PolicyRunHandle handle =
                policyEngine.runPolicy(policy, inputs, listener, null, documentReference);
        docCounter.record(EditorSource.counterKey(policy.teamId()), inputs.primary().size());
        return handle;
    }

    /** Run an ad-hoc pipeline with no stored policy (AI/Automate one-offs). */
    public PolicyRunHandle runAdHoc(
            PipelineDefinition definition, PolicyInputs inputs, PolicyProgressListener listener) {
        requireDatabaseAccess();
        return policyEngine.submit(definition, inputs, listener);
    }

    private void requireDatabaseAccess() {
        if (databaseLicenseGuard.requiresActivation()) {
            throw new IllegalStateException(
                    "Link a paid Team account or install a Server licence before processing");
        }
    }

    /** Whether nothing of the policy is running or mid-settle — safe to move its files. */
    public boolean quiesced(String policyId) {
        return !policyEngine.hasActiveRuns(policyId) && !processedLedger.anyInFlight(policyId);
    }

    /** Cancel every non-terminal run of the policy (see {@link PolicyEngine#cancelAllFor}). */
    public int cancelRuns(String policyId) {
        return policyEngine.cancelAllFor(policyId);
    }

    /**
     * Wait until every run of the policy has settled its claim: none outside a terminal state, no
     * ledger row in flight. False on timeout — a run inside a long tool call can outlive any
     * reasonable request budget.
     */
    public boolean awaitQuiesce(String policyId, Duration timeout) {
        long deadline = System.currentTimeMillis() + timeout.toMillis();
        while (policyEngine.hasActiveRuns(policyId) || processedLedger.anyInFlight(policyId)) {
            if (System.currentTimeMillis() >= deadline) {
                return false;
            }
            try {
                Thread.sleep(150);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return true;
    }

    /**
     * Resolves the source and starts a run per unit; records how many documents the source fed and
     * returns the ids of the runs started. Any source that could not be listed completely vetoes
     * this sweep's ledger cleanup.
     */
    private List<String> pullAndRun(
            Policy policy, Source storedSource, PolicySweep context, Semaphore admission) {
        InputSpec spec = storedSource.toInputSpec();
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
            work = source.resolve(storedSource, context, policy.owner());
        } catch (IOException | RuntimeException e) {
            log.warn(
                    "Failed to resolve source '{}' for policy {}: {}",
                    spec.type(),
                    policy.id(),
                    e.getMessage());
            // Recorded, not just logged: its owner would otherwise never hear that the folder
            // stopped working. The reason without the path: reviewers across the team read this.
            failureRecorder.recordRunFailureAs(
                    FailureKind.SOURCE_UNREADABLE,
                    null,
                    policy.id(),
                    storedSource.id(),
                    policy.owner(),
                    e instanceof FileSystemException fs && fs.getReason() != null
                            ? fs.getReason()
                            : "The folder could not be listed");
            context.vetoCleanup();
            return List.of();
        }
        List<String> runIds = new ArrayList<>();
        List<CompletableFuture<PolicyRun>> completions = new ArrayList<>();
        long docsFed = 0;
        for (ResolvedInput unit : work) {
            PolicyRunHandle handle =
                    startRun(
                            policy,
                            storedSource,
                            unit.fileIdentity(),
                            unit.inputs(),
                            unit.onComplete(),
                            admission);
            runIds.add(handle.runId());
            completions.add(
                    handle.completion()
                            .handle(
                                    (run, error) -> {
                                        if (error != null) {
                                            log.warn(
                                                    "Could not finish run {} in source batch {} for policy {}",
                                                    handle.runId(),
                                                    storedSource.id(),
                                                    policy.id(),
                                                    error);
                                            return null;
                                        }
                                        return run;
                                    }));
            docsFed += unit.inputs().primary().size();
        }
        if (!completions.isEmpty()) {
            CompletableFuture.allOf(completions.toArray(CompletableFuture[]::new))
                    .thenRun(
                            () -> {
                                if (completions.stream()
                                        .map(CompletableFuture::join)
                                        .anyMatch(PolicyRunner::madeProgress)) {
                                    eventPublisher.publishEvent(
                                            new SourceBatchSettledEvent(
                                                    policy.id(), storedSource.id()));
                                }
                            })
                    .exceptionally(
                            error -> {
                                log.warn(
                                        "Could not finish source batch {} for policy {}",
                                        storedSource.id(),
                                        policy.id(),
                                        error);
                                return null;
                            });
        }
        docCounter.record(storedSource.id(), docsFed);
        return runIds;
    }

    private PolicyRunHandle startRun(
            Policy policy,
            Source source,
            String fileIdentity,
            PolicyInputs inputs,
            Consumer<Boolean> onComplete,
            Semaphore admission) {
        log.info("Running policy {} ({})", policy.id(), policy.name());
        requireDatabaseAccess();
        PolicyRunHandle handle =
                policyEngine.runPolicy(
                        policy,
                        inputs,
                        PolicyProgressListener.NOOP,
                        source,
                        fileIdentity,
                        admission);
        CompletableFuture<PolicyRun> settled =
                handle.completion()
                        .whenComplete(
                                (run, throwable) -> {
                                    boolean cancelled =
                                            run != null
                                                    && run.getStatus() == PolicyRunStatus.CANCELLED;
                                    boolean neverAdmitted =
                                            run != null
                                                    && PolicyEngine.QUEUE_FULL_CODE.equals(
                                                            run.getErrorCode());
                                    if (cancelled || neverAdmitted) {
                                        // Neither cancellation nor queue rejection is a verdict
                                        // on the file; a later sweep may claim it again.
                                        onComplete.accept(false);
                                        if (fileIdentity != null) {
                                            processedLedger.forget(policy.id(), fileIdentity);
                                        }
                                        return;
                                    }
                                    onComplete.accept(succeeded(run, throwable));
                                });
        return new PolicyRunHandle(handle.runId(), settled);
    }

    private static boolean madeProgress(PolicyRun run) {
        return run != null
                && (run.getStatus() == PolicyRunStatus.COMPLETED
                        || run.getStatus() == PolicyRunStatus.FAILED)
                && !PolicyEngine.QUEUE_FULL_CODE.equals(run.getErrorCode());
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
