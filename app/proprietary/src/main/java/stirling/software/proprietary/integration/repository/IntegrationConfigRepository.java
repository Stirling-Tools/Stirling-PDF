package stirling.software.proprietary.integration.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

@Repository
public interface IntegrationConfigRepository extends JpaRepository<IntegrationConfig, Long> {

    List<IntegrationConfig> findByOwnerUser(User ownerUser);

    List<IntegrationConfig> findByOwnerTeam(Team ownerTeam);

    List<IntegrationConfig> findByScope(OwnerScope scope);
}
