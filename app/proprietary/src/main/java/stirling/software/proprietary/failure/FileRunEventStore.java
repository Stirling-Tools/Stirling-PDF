package stirling.software.proprietary.failure;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Durable store for recorded incidents. Who may act lives in {@link FileRunEventService}.
 *
 * <p>{@link #record} folds a repeat into the existing incident rather than inserting again, keyed
 * on {@code (teamId, dedupKey)}. That matters for a stateless {@code snapshot} source, which
 * re-lists every file on each sweep: the same broken file is one incident, not one per sweep.
 * Distinct files keep distinct rows, so a reviewer can still act on any one of them.
 */
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class FileRunEventStore {

    /** Only ever need the newest match; the index is ordered so this is a single-row read. */
    private static final int NEWEST = 1;

    private final FileRunEventRepository repository;

    /**
     * Record a failure, folding it into an existing incident when one matches.
     *
     * <p>Deliberately not {@code @Transactional}: each repository call runs in its own transaction,
     * so losing the insert race below leaves no rolled-back transaction to recover from.
     */
    public FileRunEvent record(RecordFailure command) {
        String dedupKey = command.dedupKey();
        Instant now = Instant.now();

        Optional<FileRunEvent> folded =
                findByDedupKey(command.teamId(), dedupKey)
                        .flatMap(row -> absorb(row.getId(), command, now));
        if (folded.isPresent()) {
            return folded.get();
        }

        try {
            return FileRunEvent.of(insert(command, dedupKey, now));
        } catch (PersistenceException e) {
            // The unique constraint fired, so a concurrent writer inserted this incident between
            // our read and our insert. Their row is the incident; fold into it instead of failing.
            return findByDedupKey(command.teamId(), dedupKey)
                    .flatMap(row -> absorb(row.getId(), command, now))
                    .orElseThrow(() -> e);
        }
    }

    private Optional<FileRunEventEntity> findByDedupKey(Long teamId, String dedupKey) {
        return repository.findByTeamAndDedupKey(teamId, dedupKey, NEWEST).stream().findFirst();
    }

    /**
     * Fold a repeat into an existing incident. {@code DISMISSED} stays dismissed, so a reviewer's
     * "stop showing me this" holds; {@code RESOLVED} reopens, so a recurrence is visible again.
     *
     * <p>Both steps are single guarded UPDATE statements against the row's current values, never a
     * save of the entity we read: that would merge a possibly stale snapshot over concurrent
     * writes, losing counts and reverting a dismiss that landed in between.
     *
     * <p>Empty when the row went away between the caller's read and the fold, so the caller inserts
     * instead. Reporting that as an error would lose the incident for a log line.
     */
    private Optional<FileRunEvent> absorb(String id, RecordFailure command, Instant now) {
        if (repository.fold(id, now, command.detail()) == 0) {
            return Optional.empty();
        }
        repository.reopenIfResolved(id);
        return repository.findByIdOptional(id).map(FileRunEvent::of);
    }

    private FileRunEventEntity insert(RecordFailure command, String dedupKey, Instant now) {
        FailureKind kind = command.kind();
        FileRunEventEntity entity = new FileRunEventEntity();
        entity.setId(UUID.randomUUID().toString());
        entity.setTeamId(command.teamId());
        entity.setActor(command.actor());
        entity.setKindId(kind.getId());
        // Snapshot the facets so a later registry edit does not rewrite what this row meant.
        entity.setStage(kind.getStage());
        entity.setSeverity(kind.getSeverity());
        entity.setScope(kind.getScope());
        entity.setOrigin(command.origin());
        entity.setPolicyId(command.policyId());
        entity.setRunId(command.runId());
        entity.setSourceId(command.sourceId());
        entity.setFileId(command.fileId());
        entity.setDetail(command.detail());
        entity.setDedupKey(dedupKey);
        entity.setOccurrences(1);
        entity.setStatus(FileRunEventStatus.NEW);
        entity.setCreatedAt(now);
        entity.setLastSeenAt(now);
        // Flushed so a duplicate-key violation surfaces here, inside record()'s catch. A plain
        // persist() defers the INSERT to commit time once a caller is transactional, and the
        // violation would escape the catch as a 500.
        return repository.insert(entity);
    }

    /**
     * A page of incidents, newest first, optionally narrowed to one status and one kind.
     *
     * <p>With no status asked for this is the <em>open</em> queue rather than every row ever
     * recorded: a dismissed failure has been dealt with, and leaving it in the default view means
     * the list can never be cleared. Ask for a status to see closed rows.
     *
     * <p>Both filters live in the query, before the limit: filtering an already-limited page could
     * return nothing while matching rows exist.
     *
     * <p>{@code actor} narrows to one person's own failures, or reads the whole team when null. Who
     * gets which is the service's decision, not this method's.
     */
    @Transactional(Transactional.TxType.SUPPORTS)
    public List<FileRunEvent> list(
            Long teamId, FileRunEventStatus status, String kindId, String actor, int limit) {
        int pageSize = Math.max(1, limit);
        List<FileRunEventEntity> rows =
                status == null
                        ? repository.findByTeamAndStatusIn(
                                teamId, FileRunEventStatus.open(), kindId, actor, pageSize)
                        : repository.findByTeamAndStatus(teamId, status, kindId, actor, pageSize);
        return rows.stream().map(FileRunEvent::of).toList();
    }

    @Transactional(Transactional.TxType.SUPPORTS)
    public Optional<FileRunEvent> find(String id, Long teamId) {
        return repository.findByIdAndTeam(id, teamId).map(FileRunEvent::of);
    }

    /**
     * Transition an open row, refusing a closed one. The service checks {@code terminal()} before
     * dispatching, but that check and this write are separate requests under concurrency; the
     * guarded UPDATE is what makes two racing closes resolve to one winner.
     *
     * @throws FailureActionException {@code ALREADY_CLOSED} when the row exists but is terminal,
     *     {@code EVENT_NOT_FOUND} when it does not exist for this team
     */
    @Transactional
    public FileRunEvent applyStatus(
            String id, Long teamId, FileRunEventStatus target, String actor) {
        return applyStatus(id, teamId, target, actor, FileRunEventStatus.open())
                .orElseThrow(() -> refusalFor(id, teamId));
    }

    /**
     * As {@link #applyStatus(String, Long, FileRunEventStatus, String)} but with the caller naming
     * which current statuses may transition. Empty when the row exists outside {@code allowedFrom}.
     *
     * <p>The UPDATE runs first and nothing is read beforehand: a pre-read only to classify the
     * refusal would be one more thing to race with, and would report a row deleted in between as
     * closed rather than missing.
     */
    @Transactional
    public Optional<FileRunEvent> applyStatus(
            String id,
            Long teamId,
            FileRunEventStatus target,
            String actor,
            Collection<FileRunEventStatus> allowedFrom) {
        if (repository.applyStatusIf(id, teamId, target, actor, Instant.now(), allowedFrom) == 0) {
            return Optional.empty();
        }
        return repository.findByIdAndTeam(id, teamId).map(FileRunEvent::of);
    }

    /**
     * Transition, or accept that someone else already reached {@code target}. The loser of a race
     * reads the winner's row back rather than re-stamping it, so the first actor keeps the credit.
     */
    @Transactional
    public FileRunEvent applyStatusOnce(
            String id,
            Long teamId,
            FileRunEventStatus target,
            String actor,
            Collection<FileRunEventStatus> allowedFrom) {
        return applyStatus(id, teamId, target, actor, allowedFrom)
                .or(() -> find(id, teamId).filter(current -> current.status() == target))
                .orElseThrow(() -> refusalFor(id, teamId));
    }

    /**
     * Close this owner's open incidents about {@code fileIds}, because the documents are gone. The
     * rows stay for audit; they just leave the queue. Only open rows move, so a reviewer's dismiss
     * keeps its meaning and its actor.
     *
     * @return how many incidents were closed
     */
    @Transactional
    public int markFilesRemoved(Long teamId, String actor, Collection<String> fileIds) {
        if (fileIds.isEmpty()) {
            return 0;
        }
        return repository.markFilesRemoved(
                teamId, actor, fileIds, Instant.now(), FileRunEventStatus.open());
    }

    /**
     * Why the guarded UPDATE refused, worked out only once it has. Missing and closed are told
     * apart after the fact rather than before, so the answer describes the row the UPDATE saw.
     */
    private FailureActionException refusalFor(String id, Long teamId) {
        return repository.findByIdAndTeam(id, teamId).isPresent()
                ? new FailureActionException(
                        FailureActionException.Reason.ALREADY_CLOSED,
                        "Event " + id + " is already closed")
                // The same reason the service raises for an id it never found, so losing a delete
                // race answers 404 like every other "no such event" rather than 400.
                : new FailureActionException(
                        FailureActionException.Reason.EVENT_NOT_FOUND, "No such event: " + id);
    }
}
