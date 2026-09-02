package stirling.software.proprietary.integration.repository;

import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.access.model.OwnerScope;
import stirling.software.proprietary.integration.model.IntegrationConfig;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

@ApplicationScoped
public class IntegrationConfigRepository implements PanacheRepositoryBase<IntegrationConfig, Long> {

    public List<IntegrationConfig> findByOwnerUser(User ownerUser) {
        return list("ownerUser", ownerUser);
    }

    public List<IntegrationConfig> findByOwnerTeam(Team ownerTeam) {
        return list("ownerTeam", ownerTeam);
    }

    public List<IntegrationConfig> findByScope(OwnerScope scope) {
        return list("scope", scope);
    }

    // Filter on the real ownerTeam.id association path: OwnedResource's getOwnerTeamId() is a
    // convenience getter, not a persistent attribute, so "ownerTeamId" is a phantom property.
    public boolean existsByOwnerTeam_Id(Long teamId) {
        return count("ownerTeam.id = ?1", teamId) > 0;
    }

    @Transactional
    public void deleteByOwnerUser(User ownerUser) {
        delete("ownerUser", ownerUser);
    }

    @Transactional
    public void deleteByOwnerTeam_Id(Long teamId) {
        delete("ownerTeam.id = ?1", teamId);
    }

    /** Spring Data {@code save}: inserts a new config, dirty-checks a managed one. */
    @Transactional
    public IntegrationConfig save(IntegrationConfig config) {
        persist(config);
        return config;
    }
}
