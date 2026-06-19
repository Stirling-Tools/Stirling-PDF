package stirling.software.proprietary.security.database.repository;

import java.util.Set;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.security.model.Authority;

/**
 * Quarkus Panache repository for {@link Authority}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<Authority, Long>}. The derived finders are
 * reimplemented as Panache queries: {@code findByUser_Username} traverses the {@code user.username}
 * association path and {@code findByUserId} matches on the {@code user.id} foreign key.
 */
@ApplicationScoped
public class AuthorityRepository implements PanacheRepositoryBase<Authority, Long> {

    public Set<Authority> findByUser_Username(String username) {
        return new java.util.HashSet<>(list("user.username", username));
    }

    public Authority findByUserId(long userId) {
        return find("user.id", userId).firstResult();
    }
}
