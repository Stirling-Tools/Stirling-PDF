package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link FileRunEventStore} against the real JPQL on a real (H2) database. Every other test in this
 * package substitutes {@link InMemoryFileRunEventRepository}, whose Java filters would keep passing
 * if the queries themselves regressed — the team-isolation clause could be deleted from the JPQL
 * and no in-memory test would notice.
 *
 * <p>{@code NOT_SUPPORTED} suspends {@code @DataJpaTest}'s per-test transaction, so every store
 * call commits in its own transaction as at runtime. That is what makes the stale-snapshot test
 * meaningful: inside one shared persistence context, both reads would hand back the same managed
 * instance and the bug could not show.
 */
@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class FileRunEventStoreDbTest {

    private static final Long TEAM = 7L;
    private static final Long OTHER_TEAM = 9L;

    @Autowired private FileRunEventRepository repository;

    private FileRunEventStore store;

    @BeforeEach
    void setUp() {
        store = new FileRunEventStore(repository);
    }

    @AfterEach
    void wipe() {
        repository.deleteAllInBatch();
    }

    private RecordFailure failure(FailureKind kind, Long teamId, String fileId) {
        return new RecordFailure(
                kind,
                FailureOrigin.PROCESSOR,
                teamId,
                "author@example.com",
                "policy-1",
                "run-1",
                null,
                fileId,
                "detail");
    }

    @Test
    @DisplayName("team isolation is enforced by the query, including the unteamed rows")
    void teamIsolationIsEnforcedBySql() {
        store.record(failure(FailureKind.UNKNOWN, TEAM, "ours"));
        store.record(failure(FailureKind.UNKNOWN, OTHER_TEAM, "theirs"));
        store.record(failure(FailureKind.UNKNOWN, null, "unteamed"));

        assertThat(store.list(TEAM, null, null, 10))
                .extracting(FileRunEvent::fileId)
                .containsExactly("ours");
        // A plain `e.teamId = :teamId` would return nothing here: SQL equality against NULL is
        // never true, which is what the explicit null branch in the JPQL exists for.
        assertThat(store.list(null, null, null, 10))
                .extracting(FileRunEvent::fileId)
                .containsExactly("unteamed");
    }

    @Test
    @DisplayName("a fold lands on the row's current state, not the caller's snapshot")
    void foldTargetsTheCurrentRowNotACallersSnapshot() {
        // The lost-update shape: record reads the row, a reviewer dismisses it, then the fold
        // applies. A save() of the stale snapshot would merge status = NEW back over the dismiss.
        FileRunEvent event = store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f"));
        store.applyStatus(event.id(), TEAM, FileRunEventStatus.DISMISSED, "reviewer@example.com");

        FileRunEvent folded =
                store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f"));

        assertThat(folded.status()).isEqualTo(FileRunEventStatus.DISMISSED);
        assertThat(folded.statusActor()).isEqualTo("reviewer@example.com");
        assertThat(folded.occurrences()).isEqualTo(2);
    }

    @Test
    @DisplayName("a dismiss landing mid-fold is not reverted by the folder's stale snapshot")
    void aDismissLandingMidFoldIsNotReverted() {
        // The reviewer's repro, made deterministic: the fold's read happens, then a dismiss lands,
        // then the fold applies. The old save()-based absorb merged the pre-dismiss snapshot back
        // over the row, reverting status to NEW and erasing the reviewer's action.
        FileRunEvent event = store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f"));
        AtomicBoolean interleaved = new AtomicBoolean();
        FileRunEventRepository interleaving =
                (FileRunEventRepository)
                        Proxy.newProxyInstance(
                                getClass().getClassLoader(),
                                new Class<?>[] {FileRunEventRepository.class},
                                (proxy, method, args) -> {
                                    Object result;
                                    try {
                                        result = method.invoke(repository, args);
                                    } catch (InvocationTargetException e) {
                                        throw e.getCause();
                                    }
                                    if ("findByTeamAndDedupKey".equals(method.getName())
                                            && interleaved.compareAndSet(false, true)) {
                                        store.applyStatus(
                                                event.id(),
                                                TEAM,
                                                FileRunEventStatus.DISMISSED,
                                                "reviewer@example.com");
                                    }
                                    return result;
                                });

        FileRunEvent folded =
                new FileRunEventStore(interleaving)
                        .record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f"));

        assertThat(folded.status()).isEqualTo(FileRunEventStatus.DISMISSED);
        assertThat(folded.statusActor()).isEqualTo("reviewer@example.com");
        assertThat(folded.occurrences()).isEqualTo(2);
    }

    @Test
    @DisplayName("a row deleted between the dedup read and the fold is re-inserted, not lost")
    void aVanishedRowIsReinsertedRatherThanLost() {
        // Retention or a manual purge can delete the row a fold was about to land on. The fold
        // then matches nothing, and treating that as an error would drop the incident entirely:
        // the recorder swallows what record() throws, leaving the failure as only a log line.
        FileRunEvent first = store.record(failure(FailureKind.UNKNOWN, TEAM, "f"));
        AtomicBoolean deleted = new AtomicBoolean();
        FileRunEventRepository vanishing =
                (FileRunEventRepository)
                        Proxy.newProxyInstance(
                                getClass().getClassLoader(),
                                new Class<?>[] {FileRunEventRepository.class},
                                (proxy, method, args) -> {
                                    if ("fold".equals(method.getName())
                                            && deleted.compareAndSet(false, true)) {
                                        repository.deleteById(first.id());
                                    }
                                    try {
                                        return method.invoke(repository, args);
                                    } catch (InvocationTargetException e) {
                                        throw e.getCause();
                                    }
                                });

        FileRunEvent replacement =
                new FileRunEventStore(vanishing).record(failure(FailureKind.UNKNOWN, TEAM, "f"));

        assertThat(replacement.id()).isNotEqualTo(first.id());
        assertThat(replacement.occurrences()).isEqualTo(1);
        assertThat(store.list(TEAM, null, null, 10)).hasSize(1);
    }

    @Test
    @DisplayName("the kind filter applies before the limit, not after")
    void kindFilterAppliesBeforeTheLimit() {
        store.record(failure(FailureKind.UNKNOWN, TEAM, "old-unknown"));
        for (int i = 0; i < 3; i++) {
            store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "newer-" + i));
        }

        assertThat(store.list(TEAM, null, "UNKNOWN", 1))
                .extracting(FileRunEvent::fileId)
                .containsExactly("old-unknown");
    }

    @Test
    @DisplayName("two racing closes resolve to one winner")
    void twoClosesResolveToOneWinner() {
        FileRunEvent event = store.record(failure(FailureKind.UNKNOWN, TEAM, "f"));
        store.applyStatus(event.id(), TEAM, FileRunEventStatus.DISMISSED, "first@example.com");

        // The second close passed the service's terminal() pre-check in its own request; the
        // guarded UPDATE is what refuses it here.
        assertThatThrownBy(
                        () ->
                                store.applyStatus(
                                        event.id(),
                                        TEAM,
                                        FileRunEventStatus.DISMISSED,
                                        "second@example.com"))
                .isInstanceOf(FailureActionException.class)
                .extracting(e -> ((FailureActionException) e).getReason())
                .isEqualTo(FailureActionException.Reason.ALREADY_CLOSED);

        assertThat(store.find(event.id(), TEAM).orElseThrow().statusActor())
                .isEqualTo("first@example.com");
    }

    @Test
    @DisplayName("losing a delete race reports the row missing, not closed")
    void aDeletedRowIsReportedMissingRatherThanClosed() {
        // Both refusals come from the same guarded UPDATE returning zero rows, so the store has to
        // tell them apart afterwards. Getting it wrong answers 400 for a row that is simply gone,
        // where every other "no such event" answers 404.
        FileRunEvent event = store.record(failure(FailureKind.UNKNOWN, TEAM, "f"));
        repository.deleteById(event.id());

        assertThatThrownBy(
                        () ->
                                store.applyStatus(
                                        event.id(),
                                        TEAM,
                                        FileRunEventStatus.DISMISSED,
                                        "reviewer@example.com"))
                .isInstanceOf(FailureActionException.class)
                .extracting(e -> ((FailureActionException) e).getReason())
                .isEqualTo(FailureActionException.Reason.EVENT_NOT_FOUND);
    }

    @Test
    @DisplayName("a reopened incident only flips from RESOLVED, never from DISMISSED")
    void reopenFlipsOnlyResolved() {
        FileRunEvent resolved = store.record(failure(FailureKind.UNKNOWN, TEAM, "resolved-file"));
        store.applyStatus(resolved.id(), TEAM, FileRunEventStatus.RESOLVED, "system");

        FileRunEvent reopened = store.record(failure(FailureKind.UNKNOWN, TEAM, "resolved-file"));

        assertThat(reopened.status()).isEqualTo(FileRunEventStatus.NEW);
        assertThat(reopened.statusActor()).isNull();
    }

    @Test
    @DisplayName("the unique constraint exists in the DDL, not only in the entity annotation")
    void duplicateIncidentInsertTripsTheUniqueConstraint() {
        store.record(failure(FailureKind.UNKNOWN, TEAM, "f"));
        String dedupKey = failure(FailureKind.UNKNOWN, TEAM, "f").dedupKey();

        FileRunEventEntity duplicate = new FileRunEventEntity();
        duplicate.setId(UUID.randomUUID().toString());
        duplicate.setTeamId(TEAM);
        duplicate.setKindId(FailureKind.UNKNOWN.getId());
        duplicate.setStage(FailureStage.INTERNAL);
        duplicate.setSeverity(FailureSeverity.ERROR);
        duplicate.setScope(FailureScope.RUN);
        duplicate.setOrigin(FailureOrigin.PROCESSOR);
        duplicate.setDedupKey(dedupKey);
        duplicate.setOccurrences(1);
        duplicate.setStatus(FileRunEventStatus.NEW);
        duplicate.setCreatedAt(Instant.now());
        duplicate.setLastSeenAt(Instant.now());

        assertThatThrownBy(() -> repository.saveAndFlush(duplicate))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}
