package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.dto.TeamWithUserCountDTO;

/**
 * Quarkus Panache repository for {@link Team}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<Team, Long>}. The derived finders are
 * reimplemented as Panache queries: {@code findByName} matches on the {@code name} field, and
 * {@code existsByNameIgnoreCase} performs a case-insensitive count. The aggregate JPQL constructor
 * query is preserved verbatim inside {@code findAllTeamsWithUserCount}.
 */
@ApplicationScoped
public class TeamRepository implements PanacheRepositoryBase<Team, Long> {

    public Optional<Team> findByName(String name) {
        return find("name", name).firstResultOptional();
    }

    public List<TeamWithUserCountDTO> findAllTeamsWithUserCount() {
        // The JPQL uses a constructor expression (new ...DTO(...)), so the result rows are already
        // TeamWithUserCountDTO instances; run it through the EntityManager to keep that typing.
        return getEntityManager()
                .createQuery(
                        "SELECT new stirling.software.proprietary.model.dto.TeamWithUserCountDTO(t.id, t.name, COUNT(u)) "
                                + "FROM Team t LEFT JOIN t.users u GROUP BY t.id, t.name",
                        TeamWithUserCountDTO.class)
                .getResultList();
    }

    public boolean existsByNameIgnoreCase(String name) {
        return count("LOWER(name) = LOWER(?1)", name) > 0;
    }
}
