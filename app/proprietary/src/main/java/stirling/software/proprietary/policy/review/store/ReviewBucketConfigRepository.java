package stirling.software.proprietary.policy.review.store;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ReviewBucketConfigRepository
        extends JpaRepository<ReviewBucketConfigEntity, String> {

    /**
     * The team's config row. A {@code null} teamId matches the teamless row (login-disabled
     * deployments), mirroring the team filters in {@code PolicyRepository}.
     */
    @Query(
            "select c from ReviewBucketConfigEntity c where (:teamId is null and c.teamId is null)"
                    + " or c.teamId = :teamId")
    Optional<ReviewBucketConfigEntity> findByTeam(@Param("teamId") Long teamId);
}
