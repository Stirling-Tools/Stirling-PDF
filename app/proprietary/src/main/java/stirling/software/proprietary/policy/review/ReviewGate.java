package stirling.software.proprietary.policy.review;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.RunOrigin;
import stirling.software.proprietary.policy.model.WaitState;
import stirling.software.proprietary.policy.review.signal.ClassificationConfidenceSource;
import stirling.software.proprietary.policy.review.signal.ConfidenceSignal;
import stirling.software.proprietary.policy.review.signal.ConfidenceSignalSource;
import stirling.software.proprietary.policy.review.store.ReviewStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.service.AiFeatureGate;

/**
 * Decides, just before delivery, whether a run's outputs must be held for human review, per the
 * team's {@link ReviewBucketConfig}. Only {@link RunOrigin#SOURCE} runs are ever held: files
 * auto-processed from a source have nobody watching, so a hold surfaces in the portal review queue;
 * editor uploads are reviewed in the editor by the user who is right there.
 *
 * <p>A hold persists the outputs to {@code FileStorage} and writes a durable {@link ReviewItem}
 * carrying every {@link OutputSpec} the run was bound for, so approval can deliver to all of them
 * later even after the in-memory run is gone. Every failure inside the gate fails open (deliver
 * normally / keep the run's own failure) — review must never break processing.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReviewGate {

    /** Endpoint prefix marking a step as AI-engine-backed. */
    private static final String AI_STEP_PREFIX = "/api/v1/ai/";

    private final PolicyStore policyStore;
    private final ReviewStore reviewStore;
    private final ClassificationMetadataReader metadataReader;
    private final ClassificationConfidenceSource classificationSignals;
    private final List<ConfidenceSignalSource> signalSources;
    private final AiFeatureGate aiFeatureGate;
    private final FileStorage fileStorage;

    /**
     * Evaluate the team's review rules against the run's outputs. Returns the {@link WaitState} to
     * park the run in when the outputs were held (already persisted, item already saved), or empty
     * to deliver normally.
     */
    public Optional<WaitState> holdIfNeeded(
            PolicyRun run,
            RunOrigin origin,
            List<Resource> outputs,
            List<OutputSpec> destinations) {
        try {
            ReviewContext context = contextFor(run, origin);
            if (context == null || outputs.isEmpty()) {
                return Optional.empty();
            }
            Evaluation evaluation = evaluate(context.config(), outputs);
            if (evaluation.reasons().isEmpty()) {
                return Optional.empty();
            }
            List<HeldFile> held = persistFiles(outputs);
            if (held.isEmpty()) {
                // Nothing could be persisted; holding now would strand the outputs.
                return Optional.empty();
            }
            ReviewItem item =
                    new ReviewItem(
                            UUID.randomUUID().toString(),
                            context.policy().teamId(),
                            run.getRunId(),
                            context.policy().id(),
                            context.policy().name(),
                            ReviewItemStatus.PENDING,
                            Instant.now(),
                            null,
                            null,
                            held,
                            evaluation.reasons(),
                            evaluation.labels(),
                            destinations);
            reviewStore.saveItem(item);
            log.info(
                    "Run {} held for review ({} file(s), reasons: {})",
                    run.getRunId(),
                    held.size(),
                    evaluation.reasons().stream().map(r -> r.kind().name()).toList());
            return Optional.of(
                    new WaitState(
                            "Held for review",
                            run.stepCount(),
                            held.stream().map(HeldFile::fileId).toList()));
        } catch (RuntimeException e) {
            log.error(
                    "Review gate failed for run {}; delivering without review", run.getRunId(), e);
            return Optional.empty();
        }
    }

    /**
     * Record a failed source run as a review item, when the team opted in via {@code
     * holdFailedRuns}. The run produced no outputs, so the run's INPUTS are persisted instead —
     * otherwise a failure would silently consume the source file with nothing left to look at. They
     * are inspection-only ({@link ReviewItem#filesAreInputs()}). Never throws: this runs inside the
     * engine's failure handling and must not mask the original error.
     */
    public void recordFailure(PolicyRun run, RunOrigin origin, List<Resource> inputs) {
        try {
            ReviewContext context = contextFor(run, origin);
            if (context == null || !context.config().holdFailedRuns()) {
                return;
            }
            if (blockedByMissingAi(context.policy())) {
                // The run failed because the deployment has no AI engine, not because of anything
                // about this document. Recording it would put an identical, un-actionable item in
                // the queue for every file the source delivers: approving re-runs the same step and
                // fails again. The run still fails and still logs; review just stays out of it.
                log.warn(
                        "Not recording failed run {} for review: policy {} needs the AI engine,"
                                + " which is disabled on this deployment",
                        run.getRunId(),
                        context.policy().id());
                return;
            }
            // Best effort: if the inputs cannot be persisted we still want the failure recorded,
            // just without downloadable files.
            List<HeldFile> captured = persistFiles(inputs == null ? List.of() : inputs);
            ReviewItem item =
                    new ReviewItem(
                            UUID.randomUUID().toString(),
                            context.policy().teamId(),
                            run.getRunId(),
                            context.policy().id(),
                            context.policy().name(),
                            ReviewItemStatus.PENDING,
                            Instant.now(),
                            null,
                            null,
                            captured,
                            List.of(ReviewReason.runFailed(run.getError())),
                            List.of(),
                            destinationsFor(run));
            reviewStore.saveItem(item);
            log.info(
                    "Failed run {} recorded for review ({} input file(s) kept)",
                    run.getRunId(),
                    captured.size());
        } catch (RuntimeException e) {
            log.error("Could not record failed run {} for review", run.getRunId(), e);
        }
    }

    /**
     * The destinations a failed run was bound for, from its own definition (already resolved when
     * the run was submitted). Inline when it named none, matching what delivery would have done.
     */
    private List<OutputSpec> destinationsFor(PolicyRun run) {
        List<OutputSpec> destinations = run.getDefinition().outputs();
        return destinations.isEmpty() ? List.of(OutputSpec.inline()) : destinations;
    }

    /**
     * Whether this policy leans on the AI engine while the engine is switched off — in which case
     * its runs fail for a reason no reviewer can act on.
     */
    private boolean blockedByMissingAi(Policy policy) {
        if (aiFeatureGate.isClassifyAvailable()) {
            return false;
        }
        return policy.steps().stream()
                .map(PipelineStep::operation)
                .filter(Objects::nonNull)
                .anyMatch(operation -> operation.startsWith(AI_STEP_PREFIX));
    }

    /** The policy + enabled config governing this run, or null when review does not apply. */
    private ReviewContext contextFor(PolicyRun run, RunOrigin origin) {
        if (origin != RunOrigin.SOURCE || run.getPolicyId() == null) {
            return null;
        }
        Policy policy = policyStore.get(run.getPolicyId()).orElse(null);
        if (policy == null) {
            return null;
        }
        ReviewBucketConfig config = reviewStore.configForTeam(policy.teamId());
        if (!config.enabled()) {
            return null;
        }
        return new ReviewContext(policy, config);
    }

    private Evaluation evaluate(ReviewBucketConfig config, List<Resource> outputs) {
        Set<ReviewReason> reasons = new LinkedHashSet<>();
        // First occurrence wins across files so the item's label list stays deduplicated.
        Map<String, LabelScore> labelsById = new LinkedHashMap<>();
        boolean classified = false;
        boolean anyAssignment = false;
        for (Resource output : outputs) {
            Optional<ClassificationOutcome> read = metadataReader.read(output);
            if (read.isPresent()) {
                // Label rules read classification only, since they are about labels. A file that
                // never went through a classify step has no outcome at all, so none of them fire —
                // absent classification is never itself a reason to hold, which is what keeps the
                // queue empty (rather than full) on a deployment with the AI engine switched off.
                classified = true;
                ClassificationOutcome outcome = read.get();
                for (LabelScore assignment : outcome.assignments()) {
                    anyAssignment = true;
                    labelsById.putIfAbsent(assignment.labelId(), assignment);
                    if (config.watchedLabelIds().contains(assignment.labelId())) {
                        reasons.add(
                                ReviewReason.watchedLabel(
                                        assignment.labelId(), assignment.confidence()));
                    }
                }
                for (ConsideredLabel candidate : outcome.considered()) {
                    if (config.watchedLabelIds().contains(candidate.labelId())) {
                        reasons.add(
                                ReviewReason.skippedLabel(
                                        candidate.labelId(),
                                        candidate.confidence(),
                                        candidate.reason()));
                    }
                }
            }
            if (config.holdLowConfidence()) {
                for (ConfidenceSignal signal : confidenceSignals(output, read)) {
                    if (signal.confidence() < config.confidenceThreshold()) {
                        reasons.add(ReviewReason.lowConfidence(signal));
                    }
                }
            }
        }
        if (classified && !anyAssignment && config.holdUnlabeled()) {
            reasons.add(ReviewReason.noLabel());
        }
        return new Evaluation(List.copyOf(reasons), List.copyOf(labelsById.values()));
    }

    /**
     * Every producer's confidence for one output. The rule is deliberately producer-agnostic: any
     * step that reports how sure it was can hold a file, so a future tool only has to write {@code
     * StirlingPDFSignals} (or add a {@link ConfidenceSignalSource}) to take part.
     */
    private List<ConfidenceSignal> confidenceSignals(
            Resource output, Optional<ClassificationOutcome> classification) {
        List<ConfidenceSignal> signals = new ArrayList<>();
        // The classifier's numbers come from the outcome already in hand, so its own source is
        // skipped below rather than re-opening the PDF for a key we have just read.
        classification.ifPresent(outcome -> signals.addAll(classificationSignals.from(outcome)));
        for (ConfidenceSignalSource source : signalSources) {
            if (ClassificationConfidenceSource.PRODUCER.equals(source.producer())) {
                continue;
            }
            try {
                signals.addAll(source.read(output));
            } catch (RuntimeException e) {
                log.warn(
                        "Confidence source {} failed on {}; ignoring it",
                        source.producer(),
                        output.getFilename(),
                        e);
            }
        }
        return signals;
    }

    /**
     * Persist files so the hold survives this worker thread. Runs on the worker, so the files are
     * owned by the run's file owner via {@code JobContext} — reviewers read them back through the
     * review endpoints' team check instead. All-or-nothing: a partial set would deliver some files
     * and strand others.
     */
    private List<HeldFile> persistFiles(List<Resource> outputs) {
        List<HeldFile> held = new ArrayList<>();
        for (Resource output : outputs) {
            String name = output.getFilename() != null ? output.getFilename() : "output.pdf";
            try {
                held.add(new HeldFile(fileStorage.storeFromResource(output, name), name));
            } catch (IOException e) {
                log.warn("Could not persist output {} for review: {}", name, e.getMessage());
            }
        }
        // All or nothing: a partial hold would deliver some files and park others.
        if (held.size() != outputs.size()) {
            for (HeldFile file : held) {
                try {
                    fileStorage.deleteFile(file.fileId());
                } catch (RuntimeException e) {
                    log.warn(
                            "Could not clean up partially held file {}: {}",
                            file.fileId(),
                            e.getMessage());
                }
            }
            return List.of();
        }
        return held;
    }

    private record ReviewContext(Policy policy, ReviewBucketConfig config) {}

    private record Evaluation(List<ReviewReason> reasons, List<LabelScore> labels) {}
}
