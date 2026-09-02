package stirling.software.proprietary.failure;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/**
 * Quarkus Panache repository for {@link FileRunEventEntity}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<FileRunEventEntity, String>}: each
 * {@code @Query} keeps its JPQL rewritten to positional parameters, and {@code Pageable} becomes a
 * plain {@code limit} feeding Panache {@code page(0, limit)}. The guarded bulk UPDATEs stay single
 * statements against the row's current values - a read-modify-save would lose counts and could
 * overwrite a reviewer's dismiss.
 */
@ApplicationScoped
public class FileRunEventRepository implements PanacheRepositoryBase<FileRunEventEntity, String> {

    /**
     * As {@link #findByTeamAndStatus} but for a set of statuses, e.g. the open ones. The kind
     * filter is in the query, before the limit: filtering an already-limited page could return
     * nothing while matching rows exist.
     *
     * <p>{@code actor} narrows to one person's own failures. Null means the whole team, which only
     * a leader ever asks for: see {@code FileRunEventService#readScope}.
     */
    public List<FileRunEventEntity> findByTeamAndStatusIn(
            Long teamId,
            List<FileRunEventStatus> statuses,
            String kindId,
            String actor,
            int limit) {
        return find(
                        "from FileRunEventEntity e where ((?1 is null and e.teamId is null) or"
                                + " e.teamId = ?1) and e.status in ?2"
                                + " and (?3 is null or e.kindId = ?3)"
                                + " and (?4 is null or e.actor = ?4) order by e.lastSeenAt desc",
                        teamId,
                        statuses,
                        kindId,
                        actor)
                .page(0, limit)
                .list();
    }

    /** As {@link #findByTeamAndStatusIn} but for exactly one status, for the surface's filters. */
    public List<FileRunEventEntity> findByTeamAndStatus(
            Long teamId, FileRunEventStatus status, String kindId, String actor, int limit) {
        return find(
                        "from FileRunEventEntity e where ((?1 is null and e.teamId is null) or"
                                + " e.teamId = ?1) and e.status = ?2"
                                + " and (?3 is null or e.kindId = ?3)"
                                + " and (?4 is null or e.actor = ?4) order by e.lastSeenAt desc",
                        teamId,
                        status,
                        kindId,
                        actor)
                .page(0, limit)
                .list();
    }

    /**
     * Fold a repeat into an incident in one statement, against the row's <em>current</em> values. A
     * read-modify-save here would be a merge of a possibly stale snapshot: concurrent folds would
     * lose counts, and an in-flight fold could overwrite a reviewer's dismiss. Same idiom as {@code
     * SourceDocCountRepository#increment} and friends.
     */
    @Transactional
    public int fold(String id, Instant now, String detail) {
        int updated =
                update(
                        "update FileRunEventEntity e set e.occurrences = e.occurrences + 1,"
                                + " e.lastSeenAt = ?1, e.detail = coalesce(?2, e.detail)"
                                + " where e.id = ?3",
                        now,
                        detail,
                        id);
        clearAfterBulkUpdate(updated);
        return updated;
    }

    /**
     * A recurrence reopens {@code RESOLVED} (the fix did not hold) and {@code FILE_REMOVED} (the
     * document is back). Guarded, so a reviewer's {@code DISMISSED} is never overwritten.
     */
    @Transactional
    public int reopenIfResolved(String id) {
        int updated =
                update(
                        "update FileRunEventEntity e set e.status ="
                                + " stirling.software.proprietary.failure.FileRunEventStatus.NEW,"
                                + " e.statusActor = null, e.statusAt = null where e.id = ?1 and"
                                + " e.status in"
                                + " (stirling.software.proprietary.failure.FileRunEventStatus.RESOLVED,"
                                + " stirling.software.proprietary.failure.FileRunEventStatus.FILE_REMOVED)",
                        id);
        clearAfterBulkUpdate(updated);
        return updated;
    }

    /**
     * Apply a status transition only if the row is still in one of {@code allowedFrom}. The guard
     * runs in the database, so two racing closes cannot both succeed: the loser updates zero rows.
     */
    @Transactional
    public int applyStatusIf(
            String id,
            Long teamId,
            FileRunEventStatus target,
            String actor,
            Instant now,
            Collection<FileRunEventStatus> allowedFrom) {
        int updated =
                update(
                        "update FileRunEventEntity e set e.status = ?1, e.statusActor = ?2,"
                                + " e.statusAt = ?3 where e.id = ?4 and ((?5 is null and e.teamId"
                                + " is null) or e.teamId = ?5) and e.status in ?6",
                        target,
                        actor,
                        now,
                        id,
                        teamId,
                        allowedFrom);
        clearAfterBulkUpdate(updated);
        return updated;
    }

    /**
     * Close the incidents about documents their owner deleted from the editor: the queue is what
     * needs attention, and a document that no longer exists needs none.
     *
     * <p>Scoped by the absence of a source rather than by origin: a source-fed run's {@code fileId}
     * is a hash no client can name. Narrowed to the owner's own rows, since clients mint the ids.
     */
    @Transactional
    public int markFilesRemoved(
            Long teamId,
            String actor,
            Collection<String> fileIds,
            Instant now,
            Collection<FileRunEventStatus> allowedFrom) {
        int updated =
                update(
                        "update FileRunEventEntity e set e.status ="
                                + " stirling.software.proprietary.failure.FileRunEventStatus.FILE_REMOVED,"
                                + " e.statusActor = ?1, e.statusAt = ?2 where e.sourceId is"
                                + " null and ((?3"
                                + " is null and e.teamId is null) or e.teamId = ?3) and ((?1 is null"
                                + " and e.actor is null) or e.actor = ?1) and e.fileId in ?4 and"
                                + " e.status in ?5",
                        actor,
                        now,
                        teamId,
                        fileIds,
                        allowedFrom);
        clearAfterBulkUpdate(updated);
        return updated;
    }

    /**
     * The most recent row for this exact failure, so the rollup can increment an existing incident
     * instead of opening a new one. Team-scoped, so the same failure in two teams stays two rows.
     */
    public List<FileRunEventEntity> findByTeamAndDedupKey(Long teamId, String dedupKey, int limit) {
        return find(
                        "from FileRunEventEntity e where ((?1 is null and e.teamId is null) or"
                                + " e.teamId = ?1) and e.dedupKey = ?2 order by e.lastSeenAt desc",
                        teamId,
                        dedupKey)
                .page(0, limit)
                .list();
    }

    /** One row by id, but only if it belongs to {@code teamId}. */
    public Optional<FileRunEventEntity> findByIdAndTeam(String id, Long teamId) {
        return find(
                        "from FileRunEventEntity e where e.id = ?1 and ((?2 is null and e.teamId is"
                                + " null) or e.teamId = ?2)",
                        id,
                        teamId)
                .firstResultOptional();
    }

    /**
     * Spring Data {@code saveAndFlush(entity)}. Flushed inside its own transaction so a duplicate
     * key violation surfaces to the caller's catch rather than at some outer commit.
     */
    @Transactional
    public FileRunEventEntity insert(FileRunEventEntity entity) {
        persistAndFlush(entity);
        return entity;
    }

    /**
     * Spring Data's {@code @Modifying(clearAutomatically = true)}: a bulk UPDATE bypasses the
     * persistence context, so an already-loaded row would read back its pre-update values.
     */
    private void clearAfterBulkUpdate(int updated) {
        if (updated > 0) {
            getEntityManager().clear();
        }
    }
}
