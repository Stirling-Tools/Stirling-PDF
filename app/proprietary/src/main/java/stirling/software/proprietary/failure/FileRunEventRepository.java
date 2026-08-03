package stirling.software.proprietary.failure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface FileRunEventRepository extends JpaRepository<FileRunEventEntity, String> {

    /**
     * This team's events, newest first, scoped in the query rather than loaded and filtered. A
     * {@code null} teamId matches the rows with no team (login disabled), mirroring {@link
     * stirling.software.proprietary.policy.source.SourceRepository#findByTeam}, since a plain
     * {@code = null} would return nothing.
     */
    @Query(
            "select e from FileRunEventEntity e where ((:teamId is null and e.teamId is null) or"
                    + " e.teamId = :teamId) order by e.lastSeenAt desc")
    List<FileRunEventEntity> findByTeam(@Param("teamId") Long teamId, Pageable pageable);

    /** As {@link #findByTeam} but restricted to one status, for the review surface's filters. */
    @Query(
            "select e from FileRunEventEntity e where ((:teamId is null and e.teamId is null) or"
                    + " e.teamId = :teamId) and e.status = :status order by e.lastSeenAt desc")
    List<FileRunEventEntity> findByTeamAndStatus(
            @Param("teamId") Long teamId,
            @Param("status") FileRunEventStatus status,
            Pageable pageable);

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
