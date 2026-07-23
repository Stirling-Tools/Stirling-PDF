package stirling.software.proprietary.policy.asset;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PolicyAssetRepository extends JpaRepository<PolicyAssetEntity, String> {

    /**
     * Assets belonging to a team, newest first. A {@code null} teamId matches the rows with no team
     * (login-disabled data), mirroring {@code PolicyRepository#findByTeam}.
     */
    @Query(
            "select a from PolicyAssetEntity a where ((:teamId is null and a.teamId is null) or"
                    + " a.teamId = :teamId) order by a.createdAt desc, a.id asc")
    List<PolicyAssetEntity> findByTeam(@Param("teamId") Long teamId);
}
