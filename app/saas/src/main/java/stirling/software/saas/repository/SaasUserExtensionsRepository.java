package stirling.software.saas.repository;

import java.util.Optional;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.model.SaasUserExtensions;

@ApplicationScoped
public class SaasUserExtensionsRepository
        implements PanacheRepositoryBase<SaasUserExtensions, Long> {

    public Optional<SaasUserExtensions> findByUserId(Long userId) {
        return find("user.id = ?1", userId).firstResultOptional();
    }

    public Optional<SaasUserExtensions> findBySupabaseId(UUID supabaseId) {
        return find("user.supabaseId = ?1", supabaseId).firstResultOptional();
    }
}
