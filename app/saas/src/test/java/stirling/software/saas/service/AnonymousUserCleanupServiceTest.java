package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.saas.repository.SupabaseUserRepository;

/**
 * Unit tests for {@link AnonymousUserCleanupService}.
 *
 * <p>The service is a {@code @Scheduled} cleanup job. Its three {@code @Value} fields ({@code
 * anonEnabled}, {@code retentionDays}, {@code batchSize}) are field-injected, so each scenario
 * primes them with {@link ReflectionTestUtils}. The {@code cleanup()} method is invoked directly
 * (no Spring scheduler). Both repositories return id {@link Stream}s that the service partitions
 * into fixed-size batches via {@code Collectors.groupingBy}, then deletes each batch.
 *
 * <p>Important: the streams are consumed inside try-with-resources, so the SupabaseUser stream is a
 * {@code Stream<UUID>} and the User stream is a {@code Stream<Long>}; each stub must return a fresh
 * stream (a {@code Stream} is single-use).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AnonymousUserCleanupServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private SupabaseUserRepository supabaseUserRepository;

    private AnonymousUserCleanupService service;

    private AnonymousUserCleanupService newService(
            boolean anonEnabled, int retentionDays, int batchSize) {
        AnonymousUserCleanupService s =
                new AnonymousUserCleanupService(userRepository, supabaseUserRepository);
        ReflectionTestUtils.setField(s, "anonEnabled", anonEnabled);
        ReflectionTestUtils.setField(s, "retentionDays", retentionDays);
        ReflectionTestUtils.setField(s, "batchSize", batchSize);
        return s;
    }

    private static List<UUID> uuids(int n) {
        List<UUID> out = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            out.add(UUID.randomUUID());
        }
        return out;
    }

    private static List<Long> longs(int n) {
        List<Long> out = new ArrayList<>(n);
        for (long i = 0; i < n; i++) {
            out.add(i);
        }
        return out;
    }

    @Nested
    @DisplayName("guard clauses - no work performed")
    class Guards {

        @Test
        @DisplayName("anonymous auth disabled: returns early, touches neither repository")
        void anonDisabled_noop() {
            service = newService(false, 30, 100);

            service.cleanup();

            verifyNoInteractions(userRepository, supabaseUserRepository);
        }

        @Test
        @DisplayName("retentionDays == 0: returns early, touches neither repository")
        void zeroRetention_noop() {
            service = newService(true, 0, 100);

            service.cleanup();

            verifyNoInteractions(userRepository, supabaseUserRepository);
        }

        @Test
        @DisplayName("negative retentionDays: returns early, touches neither repository")
        void negativeRetention_noop() {
            service = newService(true, -5, 100);

            service.cleanup();

            verifyNoInteractions(userRepository, supabaseUserRepository);
        }
    }

    @Nested
    @DisplayName("cutoff date derivation")
    class CutoffDate {

        @Test
        @DisplayName("queries both repositories with a cutoff ~retentionDays before now")
        void cutoffIsRetentionDaysBeforeNow() {
            service = newService(true, 30, 100);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());

            LocalDateTime expectedLower = LocalDateTime.now().minusDays(30).minusMinutes(1);
            LocalDateTime expectedUpper = LocalDateTime.now().minusDays(30).plusMinutes(1);

            service.cleanup();

            ArgumentCaptor<LocalDateTime> supaCutoff = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(supabaseUserRepository)
                    .findByCreatedAtBeforeAndIsAnonymousTrue(supaCutoff.capture());
            assertThat(supaCutoff.getValue()).isBetween(expectedLower, expectedUpper);

            ArgumentCaptor<LocalDateTime> userCutoff = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(userRepository).findByUsernameIsNullAndCreatedAtBefore(userCutoff.capture());
            assertThat(userCutoff.getValue()).isBetween(expectedLower, expectedUpper);
        }

        @Test
        @DisplayName("both repositories receive the same cutoff instant")
        void sameCutoffForBothRepositories() {
            service = newService(true, 7, 100);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());

            service.cleanup();

            ArgumentCaptor<LocalDateTime> supaCutoff = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(supabaseUserRepository)
                    .findByCreatedAtBeforeAndIsAnonymousTrue(supaCutoff.capture());
            ArgumentCaptor<LocalDateTime> userCutoff = ArgumentCaptor.forClass(LocalDateTime.class);
            verify(userRepository).findByUsernameIsNullAndCreatedAtBefore(userCutoff.capture());

            assertThat(supaCutoff.getValue()).isEqualTo(userCutoff.getValue());
        }
    }

    @Nested
    @DisplayName("empty result sets")
    class EmptyStreams {

        @Test
        @DisplayName("no stale users: queries run but no batch delete is issued")
        void noStaleUsers_noDeletes() {
            service = newService(true, 30, 100);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());

            service.cleanup();

            verify(supabaseUserRepository)
                    .findByCreatedAtBeforeAndIsAnonymousTrue(any(LocalDateTime.class));
            verify(userRepository).findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class));
            verify(supabaseUserRepository, never()).deleteAllByIdInBatch(any());
            verify(userRepository, never()).deleteAllByIdInBatch(any());
        }
    }

    @Nested
    @DisplayName("single-batch deletion")
    class SingleBatch {

        @Test
        @DisplayName("count below batch size deletes everything in one batch per repository")
        void belowBatchSize_singleDelete() {
            service = newService(true, 30, 100);
            List<UUID> supaIds = uuids(3);
            List<Long> userIds = longs(5);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(supaIds.stream());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(userIds.stream());

            service.cleanup();

            verify(supabaseUserRepository, times(1)).deleteAllByIdInBatch(supaIds);
            verify(userRepository, times(1)).deleteAllByIdInBatch(userIds);
        }

        @Test
        @DisplayName("count exactly equal to batch size still produces exactly one batch")
        void exactlyBatchSize_singleDelete() {
            service = newService(true, 30, 4);
            List<UUID> supaIds = uuids(4);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(supaIds.stream());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());

            service.cleanup();

            verify(supabaseUserRepository, times(1)).deleteAllByIdInBatch(supaIds);
        }
    }

    @Nested
    @DisplayName("multi-batch partitioning")
    class MultiBatch {

        @Test
        @DisplayName("supabase ids split into fixed-size batches with a final remainder batch")
        void supabaseIdsPartitioned() {
            service = newService(true, 30, 2);
            // 5 ids, batch 2 -> batches of [2,2,1]
            List<UUID> supaIds = uuids(5);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(supaIds.stream());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());

            service.cleanup();

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<UUID>> captor = ArgumentCaptor.forClass(List.class);
            verify(supabaseUserRepository, times(3)).deleteAllByIdInBatch(captor.capture());

            List<List<UUID>> batches = captor.getAllValues();
            // Two full batches and one remainder batch (order of values() not asserted on).
            assertThat(batches).extracting(List::size).containsExactlyInAnyOrder(2, 2, 1);
            // Every id is deleted exactly once across all batches.
            assertThat(batches.stream().flatMap(List::stream))
                    .containsExactlyInAnyOrderElementsOf(supaIds);
        }

        @Test
        @DisplayName("user ids split into fixed-size batches; even multiple yields no remainder")
        void userIdsPartitionedEvenly() {
            service = newService(true, 30, 3);
            // 6 ids, batch 3 -> batches of [3,3]
            List<Long> userIds = longs(6);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(userIds.stream());

            service.cleanup();

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<Long>> captor = ArgumentCaptor.forClass(List.class);
            verify(userRepository, times(2)).deleteAllByIdInBatch(captor.capture());

            List<List<Long>> batches = captor.getAllValues();
            assertThat(batches).extracting(List::size).containsExactlyInAnyOrder(3, 3);
            // Within a batch, encounter order is preserved by groupingBy.
            assertThat(batches).anySatisfy(b -> assertThat(b).containsExactly(0L, 1L, 2L));
            assertThat(batches).anySatisfy(b -> assertThat(b).containsExactly(3L, 4L, 5L));
        }

        @Test
        @DisplayName("batch size of 1 produces one delete call per id")
        void batchSizeOne_oneDeletePerId() {
            service = newService(true, 30, 1);
            List<Long> userIds = longs(4);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(Stream.empty());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(userIds.stream());

            service.cleanup();

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<Long>> captor = ArgumentCaptor.forClass(List.class);
            verify(userRepository, times(4)).deleteAllByIdInBatch(captor.capture());
            assertThat(captor.getAllValues()).extracting(List::size).containsExactly(1, 1, 1, 1);
        }
    }

    @Nested
    @DisplayName("both repositories are cleaned in one run")
    class BothRepositories {

        @Test
        @DisplayName("supabase users are processed before legacy users, each in their own batches")
        void supabaseThenUsers() {
            service = newService(true, 30, 2);
            List<UUID> supaIds = uuids(3); // [2,1]
            List<Long> userIds = longs(3); // [2,1]
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(supaIds.stream());
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(userIds.stream());

            service.cleanup();

            verify(supabaseUserRepository, times(2)).deleteAllByIdInBatch(any());
            verify(userRepository, times(2)).deleteAllByIdInBatch(any());
        }
    }

    @Nested
    @DisplayName("stream lifecycle")
    class StreamLifecycle {

        @Test
        @DisplayName("each streamed result is closed via try-with-resources")
        void streamsAreClosed() {
            service = newService(true, 30, 100);

            boolean[] supaClosed = {false};
            boolean[] userClosed = {false};
            Stream<UUID> supaStream = uuids(2).stream().onClose(() -> supaClosed[0] = true);
            Stream<Long> userStream = longs(2).stream().onClose(() -> userClosed[0] = true);
            when(supabaseUserRepository.findByCreatedAtBeforeAndIsAnonymousTrue(
                            any(LocalDateTime.class)))
                    .thenReturn(supaStream);
            when(userRepository.findByUsernameIsNullAndCreatedAtBefore(any(LocalDateTime.class)))
                    .thenReturn(userStream);

            service.cleanup();

            assertThat(supaClosed[0]).as("supabase id stream closed").isTrue();
            assertThat(userClosed[0]).as("user id stream closed").isTrue();
        }
    }
}
