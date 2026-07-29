package stirling.software.proprietary.policy.review.store;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ReviewItemRepository extends JpaRepository<ReviewItemEntity, String> {

    /**
     * A team's review items, newest first. A {@code null} teamId matches the rows with no team
     * (login-disabled deployments), mirroring the team filters in {@code PolicyRepository} rather
     * than the empty result a plain {@code = null} would give.
     */
    @Query(
            "select r from ReviewItemEntity r where ((:teamId is null and r.teamId is null) or"
                    + " r.teamId = :teamId) order by r.createdAt desc, r.id desc")
    List<ReviewItemEntity> findByTeam(@Param("teamId") Long teamId);

    /** As {@link #findByTeam}, filtered to one status. */
    @Query(
            "select r from ReviewItemEntity r where ((:teamId is null and r.teamId is null) or"
                    + " r.teamId = :teamId) and r.status = :status order by r.createdAt desc,"
                    + " r.id desc")
    List<ReviewItemEntity> findByTeamAndStatus(
            @Param("teamId") Long teamId, @Param("status") String status);

    /**
     * Atomically move a still-PENDING item to {@code status}; 0 rows means another caller resolved
     * (or is resolving) it first. This is the guard against two concurrent approvals both
     * delivering the same files.
     */
    @Modifying
    @Query(
            "update ReviewItemEntity r set r.status = :status where r.id = :id and"
                    + " r.status = 'PENDING'")
    int claimPending(@Param("id") String id, @Param("status") String status);

    /** Undo {@link #claimPending} after a failed resolution, so the item can be retried. */
    @Modifying
    @Query("update ReviewItemEntity r set r.status = 'PENDING' where r.id = :id")
    void releaseClaim(@Param("id") String id);
}
