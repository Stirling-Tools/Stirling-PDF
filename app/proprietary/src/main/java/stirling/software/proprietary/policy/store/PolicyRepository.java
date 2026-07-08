package stirling.software.proprietary.policy.store;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PolicyRepository extends JpaRepository<PolicyEntity, String> {

    /** Enabled policies of a given trigger type, for background triggers to activate. */
    List<PolicyEntity> findByTriggerTypeAndEnabledTrue(String triggerType);

    /**
     * Policies belonging to a team, in run order (ascending {@code sortOrder}; a null order sorts
     * first, id breaks ties for stability). A {@code null} teamId matches the rows with no team
     * (login-disabled / pre-team data), mirroring the in-memory team filter rather than the empty
     * result a plain {@code = null} would give.
     */
    @Query(
            "select p from PolicyEntity p where ((:teamId is null and p.teamId is null) or"
                    + " p.teamId = :teamId) order by coalesce(p.sortOrder, 0) asc, p.id asc")
    List<PolicyEntity> findByTeam(@Param("teamId") Long teamId);

    /** All policies in run order — used when team scoping is off (login-disabled). */
    @Query("select p from PolicyEntity p order by coalesce(p.sortOrder, 0) asc, p.id asc")
    List<PolicyEntity> findAllOrdered();

    /** The team's highest {@code sortOrder}, or null when it has no policies yet. */
    @Query(
            "select max(p.sortOrder) from PolicyEntity p where (:teamId is null and p.teamId is"
                    + " null) or p.teamId = :teamId")
    Integer findMaxSortOrder(@Param("teamId") Long teamId);
}
