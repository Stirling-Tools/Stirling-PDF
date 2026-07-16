package stirling.software.proprietary.policy.output;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface OutputRepository extends JpaRepository<OutputEntity, String> {

    /**
     * Outputs belonging to a team, loaded without scanning every team's rows. A {@code null} teamId
     * matches the rows with no team (login-disabled / pre-team data), mirroring the in-memory team
     * filter rather than the empty result a plain {@code = null} would give.
     */
    @Query(
            "select o from OutputEntity o where (:teamId is null and o.teamId is null) or"
                    + " o.teamId = :teamId")
    List<OutputEntity> findByTeam(@Param("teamId") Long teamId);
}
