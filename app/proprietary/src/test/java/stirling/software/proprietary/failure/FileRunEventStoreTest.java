package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Tests for {@link FileRunEventStore}, driven through a hand-written in-memory repository so the
 * rollup rules are tested directly and fast. The rollup is the load-bearing part: without it,
 * Dismiss means nothing for a source that re-lists the same failing file on every sweep.
 */
class FileRunEventStoreTest {

    private static final Long TEAM = 7L;
    private static final Long OTHER_TEAM = 9L;

    private InMemoryFileRunEventRepository repository;
    private FileRunEventStore store;

    @BeforeEach
    void setUp() {
        repository = new InMemoryFileRunEventRepository();
        store = new FileRunEventStore(repository);
    }

    private RecordFailure failure(FailureKind kind, Long teamId, String fileId, String detail) {
        return new RecordFailure(
                kind,
                FailureOrigin.POLICY,
                teamId,
                "ethan@example.com",
                "policy-1",
                "run-1",
                null,
                fileId,
                detail);
    }

    @Nested
    @DisplayName("recording a new failure")
    class Insert {

        @Test
        void persistsEveryFieldAndSnapshotsTheRegistryFacets() {
            FileRunEvent event =
                    store.record(
                            failure(
                                    FailureKind.INPUT_PASSWORD_PROTECTED,
                                    TEAM,
                                    "file-1",
                                    "locked"));

            assertThat(event.id()).isNotBlank();
            assertThat(event.teamId()).isEqualTo(TEAM);
            assertThat(event.actor()).isEqualTo("ethan@example.com");
            assertThat(event.kind()).isEqualTo(FailureKind.INPUT_PASSWORD_PROTECTED);
            assertThat(event.policyId()).isEqualTo("policy-1");
            assertThat(event.runId()).isEqualTo("run-1");
            assertThat(event.fileId()).isEqualTo("file-1");
            assertThat(event.origin()).isEqualTo(FailureOrigin.POLICY);
            assertThat(event.status()).isEqualTo(FileRunEventStatus.NEW);
            assertThat(event.occurrences()).isEqualTo(1);
            assertThat(event.createdAt()).isNotNull();
            assertThat(event.lastSeenAt()).isNotNull();

            // Snapshotted, not derived: re-classifying a kind later must not rewrite this row.
            assertThat(event.stage()).isEqualTo(FailureStage.INPUT);
            assertThat(event.severity()).isEqualTo(FailureSeverity.ERROR);
            assertThat(event.scope()).isEqualTo(FailureScope.FILE);
        }

        @Test
        void keepsTheRawDetailVerbatimForAnUnknownKind() {
            // For UNKNOWN this string is the only diagnostic there is, so it has to reach the row
            // unaltered. Redaction itself has its own tests.
            String raw = "Policy run failed: java.lang.IllegalStateException: pool exhausted";
            FileRunEvent event = store.record(failure(FailureKind.UNKNOWN, TEAM, null, raw));

            assertThat(event.detail()).isEqualTo(raw);
        }
    }

    @Nested
    @DisplayName("the rollup")
    class Rollup {

        @Test
        void foldsARepeatIntoTheOpenIncidentInsteadOfInsertingAgain() {
            store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "file-1", "first"));
            FileRunEvent second =
                    store.record(
                            failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "file-1", "again"));

            assertThat(second.occurrences()).isEqualTo(2);
            assertThat(repository.rows).hasSize(1);
        }

        @Test
        void refreshesTheDetailSoTheNewestDiagnosticIsTheOneOnShow() {
            store.record(failure(FailureKind.UNKNOWN, TEAM, "file-1", "old message"));
            FileRunEvent second =
                    store.record(failure(FailureKind.UNKNOWN, TEAM, "file-1", "new message"));

            assertThat(second.detail()).isEqualTo("new message");
        }

        @Test
        void treatsADifferentFileAsItsOwnIncident() {
            store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "file-1", "a"));
            store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "file-2", "b"));

            assertThat(repository.rows).hasSize(2);
        }

        @Test
        void treatsADifferentKindAsItsOwnIncident() {
            store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "file-1", "a"));
            store.record(failure(FailureKind.UNKNOWN, TEAM, "file-1", "b"));

            assertThat(repository.rows).hasSize(2);
        }

        @Test
        void neverFoldsAcrossTeams() {
            // Two tenants hitting the same problem are two incidents, each owned by its own team.
            store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "file-1", "a"));
            store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, OTHER_TEAM, "file-1", "b"));

            assertThat(repository.rows).hasSize(2);
        }

        @Test
        void absorbsARepeatOntoADismissedRowWithoutReopeningIt() {
            // A snapshot-mode source re-lists every file each sweep, so without absorption a
            // dismissed failure would reappear as a new row every time.
            FileRunEvent first =
                    store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f", "a"));
            store.applyStatus(
                    first.id(), TEAM, FileRunEventStatus.DISMISSED, "reviewer@example.com");

            FileRunEvent repeat =
                    store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f", "b"));

            assertThat(repository.rows).hasSize(1);
            assertThat(repeat.status()).isEqualTo(FileRunEventStatus.DISMISSED);
            assertThat(repeat.occurrences()).isEqualTo(2);
            assertThat(repeat.statusActor()).isEqualTo("reviewer@example.com");
        }

        @Test
        void reopensAResolvedRowBecauseTheProblemHasComeBack() {
            // The counterweight to absorption, so a recurrence still surfaces.
            FileRunEvent first =
                    store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f", "a"));
            store.applyStatus(first.id(), TEAM, FileRunEventStatus.RESOLVED, "system");

            FileRunEvent repeat =
                    store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f", "b"));

            assertThat(repository.rows).hasSize(1);
            assertThat(repeat.status()).isEqualTo(FileRunEventStatus.NEW);
            assertThat(repeat.occurrences()).isEqualTo(2);
            // The previous closer no longer owns a reopened incident.
            assertThat(repeat.statusActor()).isNull();
            assertThat(repeat.statusAt()).isNull();
        }

        @Test
        void keepsAnAcknowledgedRowAcknowledgedOnRepeat() {
            FileRunEvent first =
                    store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f", "a"));
            store.applyStatus(first.id(), TEAM, FileRunEventStatus.ACKNOWLEDGED, "owner");

            FileRunEvent repeat =
                    store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f", "b"));

            assertThat(repeat.status()).isEqualTo(FileRunEventStatus.ACKNOWLEDGED);
            assertThat(repeat.statusActor()).isEqualTo("owner");
        }

        @Test
        void aSweepWhereEveryFileFailsProducesARowPerFile() {
            // Each resolved input gets its own run, so a 400-file sweep is 400 incidents rather
            // than one with a counter of 400. Grouping for display is a read-time concern.
            for (int i = 0; i < 50; i++) {
                store.record(
                        new RecordFailure(
                                FailureKind.UNKNOWN,
                                FailureOrigin.POLICY,
                                TEAM,
                                "ethan@example.com",
                                "policy-1",
                                "run-" + i,
                                null,
                                "file-" + i,
                                "OCR unavailable"));
            }

            assertThat(repository.rows).hasSize(50);
            assertThat(repository.rows.values()).allMatch(row -> row.getOccurrences() == 1);
        }

        @Test
        void treatsEachFileAsItsOwnIncidentEvenWhenNoFileIdWasCaptured() {
            // The producer path cannot always name a file, and a FILE-scoped kind then falls back
            // to
            // the run. Without that, every locked file under one policy would fold into one row.
            store.record(withoutFileId("run-a"));
            store.record(withoutFileId("run-b"));

            assertThat(repository.rows).hasSize(2);
            assertThat(repository.rows.values()).allMatch(row -> row.getOccurrences() == 1);
        }

        @Test
        void aRetryOfTheSameRunStillFoldsWhenNoFileIdWasCaptured() {
            // The flip side: the fallback must not turn a genuine repeat into a second row.
            store.record(withoutFileId("run-a"));
            store.record(withoutFileId("run-a"));

            assertThat(repository.rows).hasSize(1);
            assertThat(repository.rows.values().iterator().next().getOccurrences()).isEqualTo(2);
        }

        @Test
        void foldsIntoTheWinnersRowWhenAConcurrentWriterInsertedFirst() {
            // Two runs failing identically at once: both read, find nothing, and try to insert. The
            // loser's insert trips the unique constraint and has to fold rather than fail.
            RecordFailure command = failure(FailureKind.UNKNOWN, TEAM, "file-1", "OCR unavailable");
            FileRunEventEntity winner = rowFor(command);
            repository.beforeNextSave = () -> repository.rows.put(winner.getId(), winner);

            FileRunEvent result = store.record(command);

            assertThat(repository.rows).hasSize(1);
            assertThat(result.id()).isEqualTo(winner.getId());
            assertThat(result.occurrences()).isEqualTo(2);
        }

        /** A row as the winning writer would have inserted it, for the race above. */
        private FileRunEventEntity rowFor(RecordFailure command) {
            FileRunEventEntity entity = new FileRunEventEntity();
            entity.setId("winner");
            entity.setTeamId(command.teamId());
            entity.setKindId(command.kind().getId());
            entity.setStage(command.kind().getStage());
            entity.setSeverity(command.kind().getSeverity());
            entity.setScope(command.kind().getScope());
            entity.setOrigin(command.origin());
            entity.setDedupKey(command.dedupKey());
            entity.setOccurrences(1);
            entity.setStatus(FileRunEventStatus.NEW);
            entity.setCreatedAt(java.time.Instant.now());
            entity.setLastSeenAt(java.time.Instant.now());
            return entity;
        }

        private RecordFailure withoutFileId(String runId) {
            return new RecordFailure(
                    FailureKind.INPUT_PASSWORD_PROTECTED,
                    FailureOrigin.POLICY,
                    TEAM,
                    "ethan@example.com",
                    "policy-1",
                    runId,
                    null,
                    null,
                    "The PDF Document is passworded");
        }
    }

    @Nested
    @DisplayName("reading")
    class Reading {

        @Test
        void neverReturnsAnotherTeamsRows() {
            store.record(failure(FailureKind.UNKNOWN, TEAM, "mine", "a"));
            store.record(failure(FailureKind.UNKNOWN, OTHER_TEAM, "theirs", "b"));

            assertThat(store.list(TEAM, null, null, 50))
                    .extracting(FileRunEvent::fileId)
                    .containsExactly("mine");
        }

        @Test
        void treatsANullTeamAsTheUnteamedRows() {
            // Login-disabled deployments have no team; a plain `= null` comparison would return
            // nothing, which is why the query special-cases it.
            store.record(failure(FailureKind.UNKNOWN, null, "unteamed", "a"));
            store.record(failure(FailureKind.UNKNOWN, TEAM, "teamed", "b"));

            assertThat(store.list(null, null, null, 50))
                    .extracting(FileRunEvent::fileId)
                    .containsExactly("unteamed");
        }

        @Test
        void filtersByStatus() {
            FileRunEvent open = store.record(failure(FailureKind.UNKNOWN, TEAM, "open", "a"));
            store.record(failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "closed", "b"));
            store.applyStatus(open.id(), TEAM, FileRunEventStatus.ACKNOWLEDGED, "me");

            assertThat(store.list(TEAM, FileRunEventStatus.ACKNOWLEDGED, null, 50))
                    .extracting(FileRunEvent::fileId)
                    .containsExactly("open");
        }

        @Test
        void findScopesByTeamSoAnIdFromAnotherTeamIsInvisible() {
            FileRunEvent theirs = store.record(failure(FailureKind.UNKNOWN, OTHER_TEAM, "x", "a"));

            assertThat(store.find(theirs.id(), TEAM)).isEmpty();
            assertThat(store.find(theirs.id(), OTHER_TEAM)).isPresent();
        }
    }

    @Nested
    @DisplayName("dedup keys")
    class Keys {

        @Test
        void areDeterministicForTheSameFailure() {
            RecordFailure command = failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f", "a");

            assertThat(command.dedupKey()).isEqualTo(command.dedupKey());
        }

        @Test
        void differByKindAndByScopeReference() {
            RecordFailure a = failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f1", "x");
            RecordFailure b = failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, "f2", "x");
            RecordFailure c = failure(FailureKind.UNKNOWN, TEAM, "f1", "x");

            assertThat(a.dedupKey()).isNotEqualTo(b.dedupKey());
            assertThat(a.dedupKey()).isNotEqualTo(c.dedupKey());
        }

        @Test
        void areFixedWidthSoAnyLengthOfScopeReferenceFitsTheIndex() {
            String longKey = "s3://bucket/" + "nested/".repeat(500) + "file.pdf";
            RecordFailure command =
                    failure(FailureKind.INPUT_PASSWORD_PROTECTED, TEAM, longKey, "x");

            assertThat(command.dedupKey()).hasSize(64);
        }
    }
}
