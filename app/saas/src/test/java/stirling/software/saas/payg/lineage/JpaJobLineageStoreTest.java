package stirling.software.saas.payg.lineage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Limit;

import stirling.software.saas.payg.job.JobArtifactHash;
import stirling.software.saas.payg.job.JobArtifactHash.JobArtifactHashId;
import stirling.software.saas.payg.model.ArtifactKind;
import stirling.software.saas.payg.model.JobStatus;
import stirling.software.saas.payg.repository.JobArtifactHashRepository;

/**
 * Unit tests for {@link JpaJobLineageStore}. The {@link JobArtifactHashRepository} is mocked; the
 * rows passed to {@code saveAll} and the query params are captured to assert the storage-key
 * encoding and the status/window filtering the store delegates to the DB query.
 */
@ExtendWith(MockitoExtension.class)
class JpaJobLineageStoreTest {

    @Mock private JobArtifactHashRepository hashRepository;

    @InjectMocks private JpaJobLineageStore store;

    @Captor private ArgumentCaptor<List<JobArtifactHash>> rowsCaptor;

    private static final UUID JOB_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    @Nested
    @DisplayName("record")
    class Record {

        @Test
        @DisplayName("rejects null arguments")
        void rejectsNulls() {
            assertThatThrownBy(() -> store.record(null, Set.of(), ArtifactKind.INPUT))
                    .isInstanceOf(NullPointerException.class);
            assertThatThrownBy(() -> store.record(JOB_ID, null, ArtifactKind.INPUT))
                    .isInstanceOf(NullPointerException.class);
            assertThatThrownBy(() -> store.record(JOB_ID, Set.of(), null))
                    .isInstanceOf(NullPointerException.class);
        }

        @Test
        @DisplayName("empty signature set is a no-op")
        void emptySignatures_noOp() {
            store.record(JOB_ID, Set.of(), ArtifactKind.INPUT);
            verifyNoInteractions(hashRepository);
        }

        @Test
        @DisplayName("persists one row per signature with the storage-key encoding")
        void persistsRowsWithStorageKeys() {
            Set<LineageSignature> sigs =
                    Set.of(
                            new LineageSignature("sha256", "aaa"),
                            new LineageSignature("pdf-id", "bbb"));

            store.record(JOB_ID, sigs, ArtifactKind.OUTPUT);

            verify(hashRepository).saveAll(rowsCaptor.capture());
            List<JobArtifactHash> rows = rowsCaptor.getValue();
            assertThat(rows).hasSize(2);
            assertThat(rows)
                    .extracting(JobArtifactHash::getId)
                    .extracting(JobArtifactHashId::getContentHash)
                    .containsExactlyInAnyOrder("sha256:aaa", "pdf-id:bbb");
            assertThat(rows)
                    .allSatisfy(
                            r -> {
                                assertThat(r.getId().getJobId()).isEqualTo(JOB_ID);
                                assertThat(r.getId().getKind()).isEqualTo(ArtifactKind.OUTPUT);
                            });
        }
    }

    @Nested
    @DisplayName("findOpenJobForSignatures")
    class FindOpenJob {

        @Test
        @DisplayName("rejects null arguments")
        void rejectsNulls() {
            assertThatThrownBy(
                            () ->
                                    store.findOpenJobForSignatures(
                                            null, Set.of(), Duration.ofMinutes(1)))
                    .isInstanceOf(NullPointerException.class);
            assertThatThrownBy(
                            () -> store.findOpenJobForSignatures(1L, null, Duration.ofMinutes(1)))
                    .isInstanceOf(NullPointerException.class);
            assertThatThrownBy(() -> store.findOpenJobForSignatures(1L, Set.of(), null))
                    .isInstanceOf(NullPointerException.class);
        }

        @Test
        @DisplayName("empty candidate set returns empty without querying")
        void emptyCandidates_returnsEmpty() {
            assertThat(store.findOpenJobForSignatures(1L, Set.of(), Duration.ofMinutes(5)))
                    .isEmpty();
            verify(hashRepository, never())
                    .findOpenJobsForSignatures(any(), any(), any(), any(), any());
        }

        @Test
        @DisplayName("delegates to the repository with OPEN status, storage keys, and Limit.of(1)")
        void delegatesWithExpectedParams() {
            LocalDateTime now = LocalDateTime.now();
            LineageMatch match = new LineageMatch(JOB_ID, ArtifactKind.INPUT, now);
            when(hashRepository.findOpenJobsForSignatures(
                            eq(7L), eq(JobStatus.OPEN), any(), any(), any()))
                    .thenReturn(List.of(match));

            Set<LineageSignature> candidates =
                    Set.of(
                            new LineageSignature("sha256", "v1"),
                            new LineageSignature("pdf-id", "v2"));

            var out = store.findOpenJobForSignatures(7L, candidates, Duration.ofHours(2));

            assertThat(out).contains(match);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> keysCaptor = ArgumentCaptor.forClass(List.class);
            ArgumentCaptor<LocalDateTime> sinceCaptor =
                    ArgumentCaptor.forClass(LocalDateTime.class);
            ArgumentCaptor<Limit> limitCaptor = ArgumentCaptor.forClass(Limit.class);
            verify(hashRepository)
                    .findOpenJobsForSignatures(
                            eq(7L),
                            eq(JobStatus.OPEN),
                            sinceCaptor.capture(),
                            keysCaptor.capture(),
                            limitCaptor.capture());

            assertThat(keysCaptor.getValue()).containsExactlyInAnyOrder("sha256:v1", "pdf-id:v2");
            assertThat(limitCaptor.getValue().max()).isEqualTo(1);
            // since ≈ now − window; allow a generous slack for test execution.
            assertThat(sinceCaptor.getValue())
                    .isBefore(LocalDateTime.now().minusHours(1).minusMinutes(50));
        }

        @Test
        @DisplayName("empty repository result maps to Optional.empty")
        void noMatch_returnsEmpty() {
            when(hashRepository.findOpenJobsForSignatures(any(), any(), any(), any(), any()))
                    .thenReturn(List.of());

            assertThat(
                            store.findOpenJobForSignatures(
                                    7L,
                                    Set.of(new LineageSignature("sha256", "v1")),
                                    Duration.ofHours(1)))
                    .isEmpty();
        }
    }

    @Nested
    @DisplayName("pruneOlderThan")
    class Prune {

        @Test
        @DisplayName("rejects null cutoff")
        void rejectsNull() {
            assertThatThrownBy(() -> store.pruneOlderThan(null))
                    .isInstanceOf(NullPointerException.class);
        }

        @Test
        @DisplayName("converts the Instant cutoff to local time and returns the delete count")
        void convertsCutoffAndReturnsCount() {
            Instant cutoff = Instant.ofEpochSecond(1_700_000_000L);
            ArgumentCaptor<LocalDateTime> cutoffCaptor =
                    ArgumentCaptor.forClass(LocalDateTime.class);
            when(hashRepository.deleteOlderThan(cutoffCaptor.capture())).thenReturn(13);

            int deleted = store.pruneOlderThan(cutoff);

            assertThat(deleted).isEqualTo(13);
            assertThat(cutoffCaptor.getValue())
                    .isEqualTo(LocalDateTime.ofInstant(cutoff, ZoneId.systemDefault()));
        }
    }
}
