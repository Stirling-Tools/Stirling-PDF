package stirling.software.proprietary.policy.asset;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PolicyAssetRepository extends JpaRepository<PolicyAssetEntity, String> {

    /**
     * Metadata projection. Lists, validation and cleanup need only the fields, and selecting whole
     * entities would drag every asset's LOB (up to 50 MB each) along with them.
     */
    String META =
            "select new stirling.software.proprietary.policy.asset.PolicyAsset(a.id, a.fileName,"
                    + " a.contentType, a.fileSize, a.owner, a.teamId, a.createdAt) from"
                    + " PolicyAssetEntity a";

    @Query(META + " where a.id = :id")
    Optional<PolicyAsset> findMetaById(@Param("id") String id);

    /**
     * Assets belonging to a team, newest first. A {@code null} teamId matches the rows with no team
     * (login-disabled data), mirroring {@code PolicyRepository#findByTeam}.
     */
    @Query(
            META
                    + " where ((:teamId is null and a.teamId is null) or a.teamId = :teamId) order"
                    + " by a.createdAt desc, a.id asc")
    List<PolicyAsset> findMetaByTeam(@Param("teamId") Long teamId);

    @Query(META + " order by a.createdAt desc, a.id asc")
    List<PolicyAsset> findAllMeta();

    /** Ids of assets uploaded before {@code cutoff}, for the abandoned-upload sweep. */
    @Query("select a.id from PolicyAssetEntity a where a.createdAt < :cutoff")
    List<String> findIdsCreatedBefore(@Param("cutoff") long cutoff);
}
