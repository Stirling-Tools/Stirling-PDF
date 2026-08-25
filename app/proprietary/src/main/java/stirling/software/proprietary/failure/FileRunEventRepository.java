package stirling.software.proprietary.failure;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface FileRunEventRepository extends JpaRepository<FileRunEventEntity, String> {

    /**
     * As {@link #findByTeamAndStatus} but for a set of statuses, e.g. the open ones. The kind
     * filter is in the query, before the limit: filtering an already-limited page could return
     * nothing while matching rows exist.
     *
     * <p>{@code actor} narrows to one person's own failures. Null means the whole team, which only
     * a leader ever asks for: see {@code FileRunEventService#readScope}.
     */
    @Query(
            "select e from FileRunEventEntity e where ((:teamId is null and e.teamId is null) or"
                    + " e.teamId = :teamId) and e.status in :statuses"
                    + " and (:kindId is null or e.kindId = :kindId)"
                    + " and (:actor is null or e.actor = :actor) order by e.lastSeenAt desc")
    List<FileRunEventEntity> findByTeamAndStatusIn(
            @Param("teamId") Long teamId,
            @Param("statuses") List<FileRunEventStatus> statuses,
            @Param("kindId") String kindId,
            @Param("actor") String actor,
            Pageable pageable);

    /** As {@link #findByTeamAndStatusIn} but for exactly one status, for the surface's filters. */
    @Query(
            "select e from FileRunEventEntity e where ((:teamId is null and e.teamId is null) or"
                    + " e.teamId = :teamId) and e.status = :status"
                    + " and (:kindId is null or e.kindId = :kindId)"
                    + " and (:actor is null or e.actor = :actor) order by e.lastSeenAt desc")
    List<FileRunEventEntity> findByTeamAndStatus(
            @Param("teamId") Long teamId,
            @Param("status") FileRunEventStatus status,
            @Param("kindId") String kindId,
            @Param("actor") String actor,
            Pageable pageable);

    /**
     * Fold a repeat into an incident in one statement, against the row's <em>current</em> values. A
     * read-modify-save here would be a merge of a possibly stale snapshot: concurrent folds would
     * lose counts, and an in-flight fold could overwrite a reviewer's dismiss. Same idiom as {@code
     * SourceDocCountRepository#increment} and friends.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
            "update FileRunEventEntity e set e.occurrences = e.occurrences + 1,"
                    + " e.lastSeenAt = :now, e.detail = coalesce(:detail, e.detail)"
                    + " where e.id = :id")
    int fold(@Param("id") String id, @Param("now") Instant now, @Param("detail") String detail);

    /**
     * Reopen a resolved incident whose failure has recurred. Guarded on the current status so only
     * {@code RESOLVED} flips; a concurrent dismiss is never overwritten back to {@code NEW}.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
            "update FileRunEventEntity e set"
                    + " e.status = stirling.software.proprietary.failure.FileRunEventStatus.NEW,"
                    + " e.statusActor = null, e.statusAt = null where e.id = :id and e.status ="
                    + " stirling.software.proprietary.failure.FileRunEventStatus.RESOLVED")
    int reopenIfResolved(@Param("id") String id);

    /**
     * Apply a status transition only if the row is still in one of {@code allowedFrom}. The guard
     * runs in the database, so two racing closes cannot both succeed: the loser updates zero rows.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
            "update FileRunEventEntity e set e.status = :target, e.statusActor = :actor,"
                    + " e.statusAt = :now where e.id = :id and ((:teamId is null and e.teamId is"
                    + " null) or e.teamId = :teamId) and e.status in :allowedFrom")
    int applyStatusIf(
            @Param("id") String id,
            @Param("teamId") Long teamId,
            @Param("target") FileRunEventStatus target,
            @Param("actor") String actor,
            @Param("now") Instant now,
            @Param("allowedFrom") Collection<FileRunEventStatus> allowedFrom);

    /**
     * Close the incidents about documents their owner deleted from the editor: the queue is what
     * needs attention, and a document that no longer exists needs none.
     *
     * <p>Scoped by the absence of a source rather than by origin: a source-fed run's {@code fileId}
     * is a hash no client can name. Narrowed to the owner's own rows, since clients mint the ids.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(
            "update FileRunEventEntity e set e.status ="
                + " stirling.software.proprietary.failure.FileRunEventStatus.FILE_REMOVED,"
                + " e.statusActor = :actor, e.statusAt = :now where e.origin ="
                + " stirling.software.proprietary.failure.FailureOrigin.TOOL and ((:teamId is null"
                + " and e.teamId is null) or e.teamId = :teamId) and ((:actor is null and e.actor"
                + " is null) or e.actor = :actor) and e.fileId in :fileIds and e.status in"
                + " :allowedFrom")
    int markFilesRemoved(
            @Param("teamId") Long teamId,
            @Param("actor") String actor,
            @Param("fileIds") Collection<String> fileIds,
            @Param("now") Instant now,
            @Param("allowedFrom") Collection<FileRunEventStatus> allowedFrom);

    /**
     * The most recent row for this exact failure, so the rollup can increment an existing incident
     * instead of opening a new one. Team-scoped, so the same failure in two teams stays two rows.
     */
    @Query(
            "select e from FileRunEventEntity e where ((:teamId is null and e.teamId is null) or"
                    + " e.teamId = :teamId) and e.dedupKey = :dedupKey order by e.lastSeenAt desc")
    List<FileRunEventEntity> findByTeamAndDedupKey(
            @Param("teamId") Long teamId, @Param("dedupKey") String dedupKey, Pageable pageable);

    /** One row by id, but only if it belongs to {@code teamId}. */
    @Query(
            "select e from FileRunEventEntity e where e.id = :id and ((:teamId is null and e.teamId"
                    + " is null) or e.teamId = :teamId)")
    Optional<FileRunEventEntity> findByIdAndTeam(
            @Param("id") String id, @Param("teamId") Long teamId);
}
