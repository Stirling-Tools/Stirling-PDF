package stirling.software.proprietary.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.model.ToolRecommendationDismissal;
import stirling.software.proprietary.model.ToolRecommendationDismissalId;

@Repository
public interface ToolRecommendationDismissalRepository
        extends JpaRepository<ToolRecommendationDismissal, ToolRecommendationDismissalId> {

    List<ToolRecommendationDismissal> findByPrincipal(String principal);

    // Erasure: rows key on the raw username, so a recreated name would inherit the opt-outs.
    // No clearAutomatically: a clear would detach the User deleteUser deletes right after this.
    @Modifying
    @Transactional
    @Query("DELETE FROM ToolRecommendationDismissal d WHERE d.principal = :principal")
    int deleteByPrincipal(@Param("principal") String principal);
}
