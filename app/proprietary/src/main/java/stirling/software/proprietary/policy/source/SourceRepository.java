package stirling.software.proprietary.policy.source;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface SourceRepository extends JpaRepository<SourceEntity, String> {

    /**
     * Sources belonging to a team, loaded without scanning every team's rows. A {@code null} teamId
     * matches the rows with no team (login-disabled / pre-team data), mirroring the in-memory team
     * filter rather than the empty result a plain {@code = null} would give.
     */
    @Query(
            "select s from SourceEntity s where (:teamId is null and s.teamId is null) or"
                    + " s.teamId = :teamId")
    List<SourceEntity> findByTeam(@Param("teamId") Long teamId);
}
