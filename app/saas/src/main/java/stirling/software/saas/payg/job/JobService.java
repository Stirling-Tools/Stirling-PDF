package stirling.software.saas.payg.job;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.lineage.HashLineageDetector;
import stirling.software.saas.payg.lineage.LineageMatch;
import stirling.software.saas.payg.lineage.LineageSignature;
import stirling.software.saas.payg.model.ArtifactKind;
import stirling.software.saas.payg.model.JobStatus;
import stirling.software.saas.payg.model.JobStepStatus;
import stirling.software.saas.payg.repository.ProcessingJobRepository;
import stirling.software.saas.payg.repository.ProcessingJobStepRepository;

/**
 * Persistence + lineage policy layer for the PAYG process model. The hot-path entry point is {@link
 * #joinOrOpen}, which applies the "any-match-joins, newest wins" multi-input rule.
 *
 * <p>The charge service ({@code JobChargeService}) orchestrates around this — it resolves the
 * pricing policy, computes the step-limit ceiling for the current {@code JobSource}, calls {@link
 * #joinOrOpen}, and decides whether to record a shadow charge based on the resulting {@link
 * JoinOrOpenResult.Disposition}.
 */
@Service
@Profile("saas")
@Slf4j
public class JobService {

    private final HashLineageDetector detector;
    private final ProcessingJobRepository jobRepository;
    private final ProcessingJobStepRepository stepRepository;
    private final Duration workflowWindow;

    public JobService(
            HashLineageDetector detector,
            ProcessingJobRepository jobRepository,
            ProcessingJobStepRepository stepRepository,
            @Value("${payg.lineage.workflow-window:PT5M}") Duration workflowWindow) {
        this.detector = Objects.requireNonNull(detector, "detector");
        this.jobRepository = Objects.requireNonNull(jobRepository, "jobRepository");
        this.stepRepository = Objects.requireNonNull(stepRepository, "stepRepository");
        Objects.requireNonNull(workflowWindow, "workflowWindow");
        if (workflowWindow.isNegative() || workflowWindow.isZero()) {
            throw new IllegalArgumentException(
                    "payg.lineage.workflow-window must be positive, got " + workflowWindow);
        }
        this.workflowWindow = workflowWindow;
    }

    /**
     * Decide whether {@code inputs} should join an existing open process or start a new one, and
     * persist that decision. Returns the job to attach to plus the disposition.
     *
     * <p>Rule: hash every input. If any input's signatures match an open process owned by the same
     * user within the workflow window, attach to that process. When multiple inputs match different
     * processes, the one with the freshest {@code lastStepAt} wins — preserves the
     * "most-recent-job-wins" invariant the lineage primitives test for. When the matched process is
     * already at its step-limit ceiling, fall through to opening a fresh process; the new job's
     * input signatures are still recorded so downstream calls lineage-match to it.
     *
     * <p>Race note: the read of candidate matches and the subsequent write happen in one
     * transaction at default isolation (READ COMMITTED in Postgres). A concurrent admin write or
     * another tool call could change the match set between read and commit. For shadow mode the
     * resulting diff is a low-grade comparison artefact; tighten isolation when real charging lands
     * if it materialises as a real-money issue.
     */
    @Transactional
    public JoinOrOpenResult joinOrOpen(JobContext ctx, List<Path> inputs) throws IOException {
        Objects.requireNonNull(ctx, "ctx");
        Objects.requireNonNull(inputs, "inputs");
        if (inputs.isEmpty()) {
            throw new IllegalArgumentException("inputs must not be empty");
        }

        // Extract signatures ONCE per input, then reuse for both the lineage lookup and the
        // post-decision record() call. Avoids hashing every input twice on the hot path.
        Map<Path, Set<LineageSignature>> signaturesByInput = new HashMap<>(inputs.size());
        for (Path input : inputs) {
            signaturesByInput.put(input, detector.extractSignatures(input));
        }

        Optional<LineageMatch> bestMatch =
                findBestMatch(ctx.ownerUserId(), inputs, signaturesByInput);

        if (bestMatch.isPresent()) {
            ProcessingJob existing =
                    jobRepository
                            .findById(bestMatch.get().jobId())
                            .orElseThrow(
                                    () ->
                                            new IllegalStateException(
                                                    "Lineage match returned jobId="
                                                            + bestMatch.get().jobId()
                                                            + " but no such ProcessingJob row"
                                                            + " exists (stale signature?)"));
            if (existing.getStepCount() < ctx.stepLimit()) {
                return joinExisting(existing, signaturesByInput);
            }
            // Step-limit hit: spawn a fresh job. The new job will share input signatures with
            // the existing chain so future tool calls still lineage-match into the workflow,
            // but the freshest jobLastStepAt wins so they target the new one.
            log.debug(
                    "Job {} hit step limit ({}); spawning new process within workflow.",
                    existing.getId(),
                    ctx.stepLimit());
        }

        return openFresh(ctx, signaturesByInput);
    }

    /**
     * Records {@code outputFile}'s signatures against {@code jobId} as {@code OUTPUT}. Called after
     * a tool runs successfully — failed tools don't record outputs. Multi-output tools call this
     * once per output.
     */
    @Transactional
    public void recordOutput(UUID jobId, Path outputFile) throws IOException {
        Objects.requireNonNull(jobId, "jobId");
        Objects.requireNonNull(outputFile, "outputFile");
        detector.record(jobId, outputFile, ArtifactKind.OUTPUT);
    }

    /** Appends an audit-trail step row after a tool call completes. */
    @Transactional
    public ProcessingJobStep appendStep(
            UUID jobId,
            String toolId,
            JobStepStatus status,
            Integer inputPages,
            Long inputBytes,
            String errorCode) {
        Objects.requireNonNull(jobId, "jobId");
        Objects.requireNonNull(toolId, "toolId");
        Objects.requireNonNull(status, "status");
        ProcessingJobStep step = new ProcessingJobStep();
        step.setJobId(jobId);
        step.setToolId(toolId);
        step.setStatus(status);
        LocalDateTime now = LocalDateTime.now();
        step.setStartedAt(now);
        step.setCompletedAt(now);
        step.setInputPages(inputPages);
        step.setInputBytes(inputBytes);
        step.setErrorCode(errorCode);
        return stepRepository.save(step);
    }

    /**
     * Closes a job. Idempotent — closing an already-closed job is a silent no-op returning the
     * existing row, so multiple close paths (explicit caller, FE on-unload, stale scheduler) all
     * compose safely.
     */
    @Transactional
    public ProcessingJob close(UUID jobId) {
        Objects.requireNonNull(jobId, "jobId");
        ProcessingJob job =
                jobRepository
                        .findById(jobId)
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "No ProcessingJob with id " + jobId));
        if (job.getStatus() != JobStatus.OPEN) {
            return job;
        }
        job.setStatus(JobStatus.CLOSED);
        job.setClosedAt(LocalDateTime.now());
        return jobRepository.save(job);
    }

    /** Returns open jobs whose {@code last_step_at} is older than the workflow window. */
    @Transactional(readOnly = true)
    public List<ProcessingJob> findStale() {
        return jobRepository.findStale(JobStatus.OPEN, LocalDateTime.now().minus(workflowWindow));
    }

    /**
     * Closes all jobs returned by {@link #findStale}. Returns the count closed. Each transition
     * goes through {@link #close} semantics (idempotent), so re-running this on an empty stale set
     * is safe.
     */
    @Transactional
    public int closeStale() {
        List<ProcessingJob> stale = findStale();
        LocalDateTime now = LocalDateTime.now();
        for (ProcessingJob j : stale) {
            j.setStatus(JobStatus.CLOSED);
            j.setClosedAt(now);
        }
        if (!stale.isEmpty()) {
            jobRepository.saveAll(stale);
        }
        return stale.size();
    }

    private Optional<LineageMatch> findBestMatch(
            Long userId, List<Path> inputs, Map<Path, Set<LineageSignature>> signaturesByInput) {
        List<LineageMatch> matches = new ArrayList<>(inputs.size());
        for (Path input : inputs) {
            detector.detect(userId, signaturesByInput.get(input)).ifPresent(matches::add);
        }
        return matches.stream().max(Comparator.comparing(LineageMatch::jobLastStepAt));
    }

    private JoinOrOpenResult joinExisting(
            ProcessingJob existing, Map<Path, Set<LineageSignature>> signaturesByInput) {
        existing.setStepCount(existing.getStepCount() + 1);
        existing.setLastStepAt(LocalDateTime.now());
        ProcessingJob saved = jobRepository.save(existing);
        recordAllInputs(saved.getId(), signaturesByInput);
        return new JoinOrOpenResult(saved, JoinOrOpenResult.Disposition.JOINED);
    }

    /**
     * Open a standalone process with no lineage inputs, for a billable action that isn't
     * file/lineage-driven (e.g. an AI Create session). Because no input signatures are recorded,
     * nothing downstream can lineage-join it — each such charge stands alone. {@code docUnits} is
     * persisted so the charge service's shadow + ledger rows agree with the job.
     */
    @Transactional
    public ProcessingJob open(JobContext ctx, int docUnits) {
        Objects.requireNonNull(ctx, "ctx");
        ProcessingJob job = openFresh(ctx, Map.of()).job();
        job.setDocUnits(docUnits);
        return jobRepository.save(job);
    }

    private JoinOrOpenResult openFresh(
            JobContext ctx, Map<Path, Set<LineageSignature>> signaturesByInput) {
        ProcessingJob fresh = new ProcessingJob();
        fresh.setId(UUID.randomUUID());
        fresh.setOwnerUserId(ctx.ownerUserId());
        fresh.setOwnerTeamId(ctx.ownerTeamId());
        fresh.setProcessType(ctx.processType());
        fresh.setSource(ctx.source());
        fresh.setPolicyId(ctx.policyId());
        fresh.setStepCount(1);
        LocalDateTime now = LocalDateTime.now();
        fresh.setStartedAt(now);
        fresh.setLastStepAt(now);
        fresh.setStatus(JobStatus.OPEN);
        ProcessingJob saved = jobRepository.save(fresh);
        recordAllInputs(saved.getId(), signaturesByInput);
        return new JoinOrOpenResult(saved, JoinOrOpenResult.Disposition.OPENED);
    }

    private void recordAllInputs(UUID jobId, Map<Path, Set<LineageSignature>> signaturesByInput) {
        for (Set<LineageSignature> signatures : signaturesByInput.values()) {
            detector.record(jobId, signatures, ArtifactKind.INPUT);
        }
    }
}
