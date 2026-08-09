package stirling.software.proprietary.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.ToolRecommendationDismissal;
import stirling.software.proprietary.model.ToolRecommendationDismissalId;

@Repository
public interface ToolRecommendationDismissalRepository
        extends JpaRepository<ToolRecommendationDismissal, ToolRecommendationDismissalId> {

    List<ToolRecommendationDismissal> findByPrincipal(String principal);
}
