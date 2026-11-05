package stirling.software.proprietary.integration.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

public interface IntegrationConfigRepository extends JpaRepository<IntegrationConfig, Long> {

    List<IntegrationConfig> findByOwnerUser(User ownerUser);

    List<IntegrationConfig> findByOwnerTeam(Team ownerTeam);

    List<IntegrationConfig> findByScope(OwnerScope scope);

    // Nested path: OwnedResource has a getOwnerTeamId() convenience getter but no such persistent
    // attribute, so the plain "...OwnerTeamId" derivation resolves to a phantom property and throws
    // UnknownPathException. The underscore forces the real ownerTeam.id association path.
    boolean existsByOwnerTeam_Id(Long teamId);

    void deleteByOwnerUser(User ownerUser);

    void deleteByOwnerTeam_Id(Long teamId);
}
