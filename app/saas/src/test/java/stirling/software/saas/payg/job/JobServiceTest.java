package stirling.software.saas.payg.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import stirling.software.saas.payg.lineage.HashLineageDetector;
import stirling.software.saas.payg.lineage.LineageMatch;
import stirling.software.saas.payg.model.ArtifactKind;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.JobStatus;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.payg.repository.ProcessingJobRepository;
import stirling.software.saas.payg.repository.ProcessingJobStepRepository;

/**
 * Drives {@link JobService} through the multi-input "any-match-joins" lineage policy. Uses a fake
 * {@link HashLineageDetector} that pretends each file's signatures are pre-registered with
 * particular jobs; persistence goes through mocked repositories.
 */
class JobServiceTest {

    private static final Duration WINDOW = Duration.ofMinutes(5);

    private FakeDetector detector;
    private ProcessingJobRepository jobRepo;
    private ProcessingJobStepRepository stepRepo;
    private JobService service;

    @BeforeEach
    void setUp() {
        detector = new FakeDetector();
        jobRepo = Mockito.mock(ProcessingJobRepository.class);
        stepRepo = Mockito.mock(ProcessingJobStepRepository.class);
        // save() returns the same instance so the service can introspect post-write state.
        when(jobRepo.save(any(ProcessingJob.class))).thenAnswer(inv -> inv.getArgument(0));
        when(stepRepo.save(any(ProcessingJobStep.class))).thenAnswer(inv -> inv.getArgument(0));
        service = new JobService(detector, jobRepo, stepRepo, WINDOW);
    }

    @Test
    void constructor_rejectsNonPositiveWindow() {
        assertThatThrownBy(() -> new JobService(detector, jobRepo, stepRepo, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                new JobService(
                                        detector,
                                        jobRepo,
                                        stepRepo,
                                        Duration.ofMinutes(5).negated()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void joinOrOpen_noMatch_opensNewJob(@TempDir Path tmp) throws IOException {
        Path input = givenFile(tmp, "in.bin");
        // No detector matches.

        JoinOrOpenResult result = service.joinOrOpen(ctx(42L, 100L, 10), List.of(input));

        assertThat(result.disposition()).isEqualTo(JoinOrOpenResult.Disposition.OPENED);
        assertThat(result.job().getOwnerUserId()).isEqualTo(42L);
        assertThat(result.job().getOwnerTeamId()).isEqualTo(100L);
        assertThat(result.job().getSource()).isEqualTo(JobSource.WEB);
        assertThat(result.job().getStatus()).isEqualTo(JobStatus.OPEN);
        assertThat(result.job().getStepCount()).isEqualTo(1);
        assertThat(result.job().getId()).isNotNull();
        // Input was recorded under the new job.
        assertThat(detector.recorded(result.job().getId(), input, ArtifactKind.INPUT)).isTrue();
    }

    @Test
    void joinOrOpen_singleMatch_joinsExistingJob(@TempDir Path tmp) throws IOException {
        UUID existingId = UUID.randomUUID();
        ProcessingJob existing = openJob(existingId, 42L, 3, LocalDateTime.now());
        when(jobRepo.findById(existingId)).thenReturn(Optional.of(existing));

        Path input = givenFile(tmp, "in.bin");
        detector.willMatch(
                input, new LineageMatch(existingId, ArtifactKind.INPUT, existing.getLastStepAt()));

        JoinOrOpenResult result = service.joinOrOpen(ctx(42L, 100L, 10), List.of(input));

        assertThat(result.disposition()).isEqualTo(JoinOrOpenResult.Disposition.JOINED);
        assertThat(result.job().getId()).isEqualTo(existingId);
        assertThat(result.job().getStepCount()).isEqualTo(4); // 3 -> 4
        // Input is recorded under the joined job too — so future calls on the same input still
        // lineage-match to it.
        assertThat(detector.recorded(existingId, input, ArtifactKind.INPUT)).isTrue();
    }

    @Test
    void joinOrOpen_multiInputAnyMatchJoins(@TempDir Path tmp) throws IOException {
        // Inputs A and B; A matches existing job; B is unrelated. Should join A's job.
        UUID jobAId = UUID.randomUUID();
        ProcessingJob jobA = openJob(jobAId, 42L, 2, LocalDateTime.now());
        when(jobRepo.findById(jobAId)).thenReturn(Optional.of(jobA));

        Path inA = givenFile(tmp, "a.bin");
        Path inB = givenFile(tmp, "b.bin");
        detector.willMatch(
                inA, new LineageMatch(jobAId, ArtifactKind.OUTPUT, jobA.getLastStepAt()));
        // inB has no detector match.

        JoinOrOpenResult result = service.joinOrOpen(ctx(42L, 100L, 10), List.of(inA, inB));

        assertThat(result.disposition()).isEqualTo(JoinOrOpenResult.Disposition.JOINED);
        assertThat(result.job().getId()).isEqualTo(jobAId);
        // BOTH inputs recorded under the joined job — inB is now part of jobA's lineage tree.
        assertThat(detector.recorded(jobAId, inA, ArtifactKind.INPUT)).isTrue();
        assertThat(detector.recorded(jobAId, inB, ArtifactKind.INPUT)).isTrue();
    }

    @Test
    void joinOrOpen_multiMatchPicksNewestByLastStepAt(@TempDir Path tmp) throws IOException {
        UUID olderId = UUID.randomUUID();
        UUID newerId = UUID.randomUUID();
        LocalDateTime older = LocalDateTime.now().minus(Duration.ofMinutes(2));
        LocalDateTime newer = LocalDateTime.now();
        ProcessingJob olderJob = openJob(olderId, 42L, 1, older);
        ProcessingJob newerJob = openJob(newerId, 42L, 1, newer);
        when(jobRepo.findById(newerId)).thenReturn(Optional.of(newerJob));

        Path inA = givenFile(tmp, "a.bin");
        Path inB = givenFile(tmp, "b.bin");
        detector.willMatch(inA, new LineageMatch(olderId, ArtifactKind.OUTPUT, older));
        detector.willMatch(inB, new LineageMatch(newerId, ArtifactKind.OUTPUT, newer));

        JoinOrOpenResult result = service.joinOrOpen(ctx(42L, 100L, 10), List.of(inA, inB));

        assertThat(result.disposition()).isEqualTo(JoinOrOpenResult.Disposition.JOINED);
        assertThat(result.job().getId()).isEqualTo(newerId);
        // Older job was NOT looked up — newest wins purely by lastStepAt comparison from the
        // LineageMatch payload, before any DB lookup.
        verify(jobRepo, never()).findById(olderId);
    }

    @Test
    void joinOrOpen_stepLimitHit_spawnsNewJob(@TempDir Path tmp) throws IOException {
        UUID existingId = UUID.randomUUID();
        // stepCount equal to limit (10) → can't append, must spawn new.
        ProcessingJob existing = openJob(existingId, 42L, 10, LocalDateTime.now());
        when(jobRepo.findById(existingId)).thenReturn(Optional.of(existing));

        Path input = givenFile(tmp, "in.bin");
        detector.willMatch(
                input, new LineageMatch(existingId, ArtifactKind.OUTPUT, existing.getLastStepAt()));

        JoinOrOpenResult result = service.joinOrOpen(ctx(42L, 100L, 10), List.of(input));

        assertThat(result.disposition()).isEqualTo(JoinOrOpenResult.Disposition.OPENED);
        assertThat(result.job().getId()).isNotEqualTo(existingId);
        assertThat(result.job().getStepCount()).isEqualTo(1);
        // The original job's stepCount must NOT have been incremented (we abandoned it).
        assertThat(existing.getStepCount()).isEqualTo(10);
        // Input is recorded under the NEW job so subsequent calls lineage-match to it
        // (mostRecentMatchWins shifts the chain forward).
        assertThat(detector.recorded(result.job().getId(), input, ArtifactKind.INPUT)).isTrue();
    }

    @Test
    void joinOrOpen_emptyInputs_throws() {
        assertThatThrownBy(() -> service.joinOrOpen(ctx(42L, 100L, 10), List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("inputs must not be empty");
    }

    @Test
    void joinOrOpen_matchPointsAtMissingJob_throwsStateException(@TempDir Path tmp)
            throws IOException {
        UUID staleId = UUID.randomUUID();
        when(jobRepo.findById(staleId)).thenReturn(Optional.empty());

        Path input = givenFile(tmp, "in.bin");
        detector.willMatch(
                input, new LineageMatch(staleId, ArtifactKind.OUTPUT, LocalDateTime.now()));

        assertThatThrownBy(() -> service.joinOrOpen(ctx(42L, 100L, 10), List.of(input)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("stale signature");
    }

    @Test
    void recordOutput_delegatesToDetector(@TempDir Path tmp) throws IOException {
        UUID jobId = UUID.randomUUID();
        Path output = givenFile(tmp, "out.bin");

        service.recordOutput(jobId, output);

        assertThat(detector.recorded(jobId, output, ArtifactKind.OUTPUT)).isTrue();
    }

    @Test
    void close_idempotent() {
        UUID jobId = UUID.randomUUID();
        ProcessingJob open = openJob(jobId, 42L, 5, LocalDateTime.now());
        when(jobRepo.findById(jobId)).thenReturn(Optional.of(open));

        ProcessingJob first = service.close(jobId);
        assertThat(first.getStatus()).isEqualTo(JobStatus.CLOSED);
        assertThat(first.getClosedAt()).isNotNull();

        // Re-call: status already CLOSED, should return the same row without saving again.
        ProcessingJob second = service.close(jobId);
        assertThat(second.getStatus()).isEqualTo(JobStatus.CLOSED);
        // save was called exactly once across both close() calls.
        verify(jobRepo, times(1)).save(any(ProcessingJob.class));
    }

    @Test
    void close_unknownJob_throws() {
        UUID unknown = UUID.randomUUID();
        when(jobRepo.findById(unknown)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.close(unknown))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("No ProcessingJob");
    }

    @Test
    void closeStale_closesAllStaleJobs() {
        ProcessingJob a =
                openJob(
                        UUID.randomUUID(),
                        42L,
                        1,
                        LocalDateTime.now().minus(Duration.ofMinutes(10)));
        ProcessingJob b =
                openJob(
                        UUID.randomUUID(),
                        42L,
                        1,
                        LocalDateTime.now().minus(Duration.ofMinutes(20)));
        when(jobRepo.findStale(eq(JobStatus.OPEN), any(LocalDateTime.class)))
                .thenReturn(List.of(a, b));

        int closed = service.closeStale();

        assertThat(closed).isEqualTo(2);
        assertThat(a.getStatus()).isEqualTo(JobStatus.CLOSED);
        assertThat(b.getStatus()).isEqualTo(JobStatus.CLOSED);
        verify(jobRepo).saveAll(List.of(a, b));
    }

    @Test
    void closeStale_emptyResult_noSave() {
        when(jobRepo.findStale(eq(JobStatus.OPEN), any(LocalDateTime.class))).thenReturn(List.of());
        assertThat(service.closeStale()).isZero();
        verify(jobRepo, never()).saveAll(any());
    }

    @Test
    void appendStep_persistsStepRow() {
        UUID jobId = UUID.randomUUID();
        ArgumentCaptor<ProcessingJobStep> captor = ArgumentCaptor.forClass(ProcessingJobStep.class);

        service.appendStep(
                jobId,
                "/api/v1/general/split",
                stirling.software.saas.payg.model.JobStepStatus.OK,
                42,
                12_345L,
                null);

        verify(stepRepo, atLeastOnce()).save(captor.capture());
        ProcessingJobStep saved = captor.getValue();
        assertThat(saved.getJobId()).isEqualTo(jobId);
        assertThat(saved.getToolId()).isEqualTo("/api/v1/general/split");
        assertThat(saved.getInputPages()).isEqualTo(42);
        assertThat(saved.getInputBytes()).isEqualTo(12_345L);
    }

    // --- helpers --------------------------------------------------------------------------------

    private static JobContext ctx(long userId, long teamId, int stepLimit) {
        return new JobContext(
                userId, teamId, JobSource.WEB, ProcessType.SINGLE_TOOL, 1L, stepLimit);
    }

    private static ProcessingJob openJob(
            UUID id, long userId, int stepCount, LocalDateTime lastStepAt) {
        ProcessingJob j = new ProcessingJob();
        j.setId(id);
        j.setOwnerUserId(userId);
        j.setStatus(JobStatus.OPEN);
        j.setStepCount(stepCount);
        j.setStartedAt(lastStepAt.minus(Duration.ofMinutes(1)));
        j.setLastStepAt(lastStepAt);
        j.setProcessType(ProcessType.SINGLE_TOOL);
        j.setSource(JobSource.WEB);
        j.setPolicyId(1L);
        return j;
    }

    private static Path givenFile(Path tmp, String name) throws IOException {
        Path p = tmp.resolve(name);
        Files.writeString(p, "fixture-" + name);
        return p;
    }

    /**
     * Test double: programmable detector + records observations. Synthesises one signature per
     * path; every path seen by extractSignatures is reverse-mapped so the post-dedupe flow
     * (extractSignatures → detect/record by signature) keeps the path-based test assertions working
     * unchanged.
     */
    private static class FakeDetector implements HashLineageDetector {
        private final Map<Path, LineageMatch> matches = new HashMap<>();
        private final Set<String> observations = new java.util.HashSet<>();
        private final Map<stirling.software.saas.payg.lineage.LineageSignature, Path>
                pathBySignature = new HashMap<>();

        void willMatch(Path input, LineageMatch match) {
            matches.put(input, match);
        }

        boolean recorded(UUID jobId, Path file, ArtifactKind kind) {
            return observations.contains(jobId + "|" + file + "|" + kind);
        }

        private stirling.software.saas.payg.lineage.LineageSignature sigFor(Path file) {
            stirling.software.saas.payg.lineage.LineageSignature sig =
                    new stirling.software.saas.payg.lineage.LineageSignature(
                            "test", Integer.toHexString(file.toString().hashCode()));
            pathBySignature.put(sig, file);
            return sig;
        }

        @Override
        public Optional<LineageMatch> detect(Long userId, Path inputFile) {
            return Optional.ofNullable(matches.get(inputFile));
        }

        @Override
        public Optional<LineageMatch> detect(
                Long userId, Set<stirling.software.saas.payg.lineage.LineageSignature> signatures) {
            for (stirling.software.saas.payg.lineage.LineageSignature sig : signatures) {
                Path p = pathBySignature.get(sig);
                if (p != null && matches.containsKey(p)) {
                    return Optional.of(matches.get(p));
                }
            }
            return Optional.empty();
        }

        @Override
        public void record(UUID jobId, Path file, ArtifactKind kind) {
            observations.add(jobId + "|" + file + "|" + kind);
        }

        @Override
        public void record(
                UUID jobId,
                Set<stirling.software.saas.payg.lineage.LineageSignature> signatures,
                ArtifactKind kind) {
            for (stirling.software.saas.payg.lineage.LineageSignature sig : signatures) {
                Path p = pathBySignature.get(sig);
                if (p != null) {
                    observations.add(jobId + "|" + p + "|" + kind);
                }
            }
        }

        @Override
        public Set<stirling.software.saas.payg.lineage.LineageSignature> extractSignatures(
                Path file) {
            return Set.of(sigFor(file));
        }
    }
}
