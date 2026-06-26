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
     * Policies belonging to a team, loaded without scanning every team's rows. A {@code null}
     * teamId matches the rows with no team (login-disabled / pre-team data), mirroring the
     * in-memory team filter rather than the empty result a plain {@code = null} would give.
     */
    @Query(
            "select p from PolicyEntity p where (:teamId is null and p.teamId is null) or"
                    + " p.teamId = :teamId")
    List<PolicyEntity> findByTeam(@Param("teamId") Long teamId);
}
