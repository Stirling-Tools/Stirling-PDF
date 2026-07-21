package stirling.software.saas.payg.lineage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

import stirling.software.saas.payg.model.ArtifactKind;
import stirling.software.saas.payg.model.JobStatus;

/**
 * Exercises the detector end-to-end against the in-memory store + a fake extractor with
 * predetermined signatures. Covers the matching rules: same-user, within window, status=OPEN,
 * multi-signature, and post-record retrieval. The contract is shared with the JPA store; if Redis
 * (or any future) impl satisfies the same {@link JobLineageStore} interface, these tests are the
 * canonical "did I get the abstraction right?" check.
 */
class DefaultHashLineageDetectorTest {

    private static final Duration WINDOW = Duration.ofMinutes(5);

    private FakeFileSignatureExtractor extractor;
    private InMemoryJobLineageStore store;
    private DefaultHashLineageDetector detector;

    @BeforeEach
    void setUp() {
        extractor = new FakeFileSignatureExtractor();
        store = new InMemoryJobLineageStore();
        detector = new DefaultHashLineageDetector(List.of(extractor), store, WINDOW);
    }

    @Test
    void noPriorJobs_returnsEmpty(@TempDir Path tmp) throws IOException {
        Path file = givenFileWithSignatures(tmp, "input.bin", "sha256", "abc");

        Optional<LineageMatch> match = detector.detect(42L, file);

        assertThat(match).isEmpty();
    }

    @Test
    void matchingInputSignature_returnsLineageMatch(@TempDir Path tmp) throws IOException {
        UUID job = openJobForUser(42L, LocalDateTime.now());
        recordSignatureForJob(job, "sha256", "abc", ArtifactKind.INPUT);
        Path file = givenFileWithSignatures(tmp, "next.bin", "sha256", "abc");

        Optional<LineageMatch> match = detector.detect(42L, file);

        assertThat(match).isPresent();
        assertThat(match.get().jobId()).isEqualTo(job);
        assertThat(match.get().matchedKind()).isEqualTo(ArtifactKind.INPUT);
    }

    @Test
    void matchingOutputSignature_alsoCounts(@TempDir Path tmp) throws IOException {
        // OCR's output hash matches Compress's input hash — that's the lineage chain.
        UUID ocr = openJobForUser(42L, LocalDateTime.now());
        recordSignatureForJob(ocr, "sha256", "ocr-output-hash", ArtifactKind.OUTPUT);
        Path compressInput =
                givenFileWithSignatures(tmp, "to-compress.bin", "sha256", "ocr-output-hash");

        Optional<LineageMatch> match = detector.detect(42L, compressInput);

        assertThat(match).isPresent();
        assertThat(match.get().jobId()).isEqualTo(ocr);
        assertThat(match.get().matchedKind()).isEqualTo(ArtifactKind.OUTPUT);
    }

    @Test
    void differentUser_doesNotMatch(@TempDir Path tmp) throws IOException {
        UUID job = openJobForUser(/* userA= */ 1L, LocalDateTime.now());
        recordSignatureForJob(job, "sha256", "abc", ArtifactKind.INPUT);
        Path file = givenFileWithSignatures(tmp, "input.bin", "sha256", "abc");

        Optional<LineageMatch> match = detector.detect(/* userB= */ 2L, file);

        assertThat(match).isEmpty();
    }

    @Test
    void outsideWorkflowWindow_doesNotMatch(@TempDir Path tmp) throws IOException {
        // Job last touched 10 minutes ago; window is 5 minutes.
        UUID job = openJobForUser(42L, LocalDateTime.now().minus(Duration.ofMinutes(10)));
        recordSignatureForJob(job, "sha256", "abc", ArtifactKind.INPUT);
        Path file = givenFileWithSignatures(tmp, "input.bin", "sha256", "abc");

        Optional<LineageMatch> match = detector.detect(42L, file);

        assertThat(match).isEmpty();
    }

    @Test
    void closedJob_doesNotMatch(@TempDir Path tmp) throws IOException {
        UUID job = UUID.randomUUID();
        store.registerJob(job, 42L, JobStatus.CLOSED, LocalDateTime.now());
        recordSignatureForJob(job, "sha256", "abc", ArtifactKind.OUTPUT);
        Path file = givenFileWithSignatures(tmp, "input.bin", "sha256", "abc");

        Optional<LineageMatch> match = detector.detect(42L, file);

        assertThat(match).isEmpty();
    }

    @Test
    void multipleSignatures_matchIfAnyMatches(@TempDir Path tmp) throws IOException {
        // The job was recorded with one signature (sha256). The incoming file produces TWO
        // signatures (sha256 + pdf-id). Different sha256 (bytes changed) but same pdf-id → match.
        UUID job = openJobForUser(42L, LocalDateTime.now());
        recordSignatureForJob(job, "pdf-id", "stable-uuid", ArtifactKind.OUTPUT);

        Path file =
                givenFileWithSignatures(
                        tmp,
                        "input.pdf",
                        // Two signatures from the same file:
                        "sha256",
                        "differs-because-bytes-changed",
                        "pdf-id",
                        "stable-uuid");

        Optional<LineageMatch> match = detector.detect(42L, file);

        assertThat(match).isPresent();
        assertThat(match.get().jobId()).isEqualTo(job);
    }

    @Test
    void mostRecentMatchWins_whenMultipleJobsHaveTheSignature(@TempDir Path tmp)
            throws IOException {
        UUID older = openJobForUser(42L, LocalDateTime.now().minus(Duration.ofMinutes(2)));
        UUID newer = openJobForUser(42L, LocalDateTime.now());
        recordSignatureForJob(older, "sha256", "shared", ArtifactKind.OUTPUT);
        recordSignatureForJob(newer, "sha256", "shared", ArtifactKind.OUTPUT);
        Path file = givenFileWithSignatures(tmp, "input.bin", "sha256", "shared");

        Optional<LineageMatch> match = detector.detect(42L, file);

        assertThat(match).isPresent();
        assertThat(match.get().jobId()).isEqualTo(newer);
    }

    @Test
    void record_persistsSignatures(@TempDir Path tmp) throws IOException {
        UUID job = openJobForUser(42L, LocalDateTime.now());
        Path file = givenFileWithSignatures(tmp, "output.bin", "sha256", "fresh-hash");

        detector.record(job, file, ArtifactKind.OUTPUT);

        // Now a fresh detect() call against a different file with the same hash should match.
        Path subsequent = givenFileWithSignatures(tmp, "next.bin", "sha256", "fresh-hash");
        Optional<LineageMatch> match = detector.detect(42L, subsequent);

        assertThat(match).isPresent();
        assertThat(match.get().jobId()).isEqualTo(job);
        assertThat(match.get().matchedKind()).isEqualTo(ArtifactKind.OUTPUT);
    }

    @Test
    void extractorThrowing_doesNotBreakRecording(@TempDir Path tmp) throws IOException {
        // Composite scenario: one of two extractors throws; the other still contributes.
        FakeFileSignatureExtractor throwing =
                new FakeFileSignatureExtractor() {
                    @Override
                    public Set<LineageSignature> extract(Path file) throws IOException {
                        throw new IOException(
                                "synthetic — pretend the file is malformed for this type");
                    }

                    @Override
                    public String name() {
                        return "throwing-extractor";
                    }
                };
        DefaultHashLineageDetector composite =
                new DefaultHashLineageDetector(List.of(throwing, extractor), store, WINDOW);
        UUID job = openJobForUser(42L, LocalDateTime.now());

        Path file = givenFileWithSignatures(tmp, "input.bin", "sha256", "abc");
        composite.record(job, file, ArtifactKind.INPUT);

        // The throwing extractor's signatures didn't land, but the byte-hash one's did, so a
        // subsequent detect on a matching sha256 hash still finds the job.
        Path next = givenFileWithSignatures(tmp, "next.bin", "sha256", "abc");
        Optional<LineageMatch> match = composite.detect(42L, next);
        assertThat(match).isPresent();
    }

    @Test
    void constructor_rejectsEmptyExtractorList() {
        assertThatThrownBy(() -> new DefaultHashLineageDetector(List.of(), store, WINDOW))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void constructor_rejectsNonPositiveWorkflowWindow() {
        // Zero window: since == now, `> :since` never matches.
        assertThatThrownBy(
                        () ->
                                new DefaultHashLineageDetector(
                                        List.of(extractor), store, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must be positive");

        // Negative window: since == now + |window|, `> :since` only matches the future. Silent
        // no-match — must fail loud at startup instead.
        assertThatThrownBy(
                        () ->
                                new DefaultHashLineageDetector(
                                        List.of(extractor), store, Duration.ofMinutes(5).negated()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must be positive");
    }

    // --- helpers --------------------------------------------------------------------------------

    private UUID openJobForUser(long userId, LocalDateTime lastStepAt) {
        UUID id = UUID.randomUUID();
        store.registerJob(id, userId, JobStatus.OPEN, lastStepAt);
        return id;
    }

    private void recordSignatureForJob(UUID jobId, String type, String value, ArtifactKind kind) {
        store.record(jobId, Set.of(new LineageSignature(type, value)), kind);
    }

    private Path givenFileWithSignatures(Path tmp, String filename, String... typesAndValues)
            throws IOException {
        // typesAndValues are pairs: type1, value1, type2, value2, ...
        if (typesAndValues.length % 2 != 0) {
            throw new IllegalArgumentException("typesAndValues must be in pairs");
        }
        Set<LineageSignature> signatures =
                java.util.stream.IntStream.iterate(0, i -> i < typesAndValues.length, i -> i + 2)
                        .mapToObj(
                                i -> new LineageSignature(typesAndValues[i], typesAndValues[i + 1]))
                        .collect(java.util.stream.Collectors.toSet());

        Path file = tmp.resolve(filename);
        Files.write(file, ("placeholder bytes for " + filename).getBytes());
        extractor.setSignaturesFor(file, signatures);
        return file;
    }

    /** Test double: returns whatever signatures the test registered for a given file. */
    private static class FakeFileSignatureExtractor implements LineageSignatureExtractor {
        private final Map<Path, Set<LineageSignature>> programmed = new HashMap<>();

        void setSignaturesFor(Path file, Set<LineageSignature> sigs) {
            programmed.put(file, sigs);
        }

        @Override
        public Set<LineageSignature> extract(Path file) throws IOException {
            return programmed.getOrDefault(file, Set.of());
        }

        @Override
        public String name() {
            return "fake";
        }
    }
}
