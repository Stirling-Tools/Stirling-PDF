package stirling.software.proprietary.security.database.repository;

import java.time.Instant;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.SessionEntity;

/**
 * Quarkus Panache repository for {@link SessionEntity}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<SessionEntity, String>}. Derived finders are
 * reimplemented as Panache queries; the {@code @Query}-annotated methods preserve their original
 * JPQL strings via {@code find(...)} / {@code update(...)}.
 */
@ApplicationScoped
public class SessionRepository implements PanacheRepositoryBase<SessionEntity, String> {

    public List<SessionEntity> findByPrincipalName(String principalName) {
        return list("principalName", principalName);
    }

    public List<SessionEntity> findByExpired(boolean expired) {
        return list("expired", expired);
    }

    public SessionEntity findBySessionId(String sessionId) {
        return find("sessionId", sessionId).firstResult();
    }

    @Transactional
    public void saveByPrincipalName(boolean expired, Instant lastRequest, String principalName) {
        update(
                "expired = :expired, lastRequest = :lastRequest WHERE principalName = :principalName",
                Parameters.with("expired", expired)
                        .and("lastRequest", lastRequest)
                        .and("principalName", principalName));
    }

    public List<Object[]> findLatestActivityByTeam() {
        return getEntityManager()
                .createQuery(
                        "SELECT t.id as teamId, MAX(s.lastRequest) as lastActivity "
                                + "FROM stirling.software.proprietary.model.Team t "
                                + "LEFT JOIN t.users u "
                                + "LEFT JOIN SessionEntity s ON u.username = s.principalName "
                                + "GROUP BY t.id",
                        Object[].class)
                .getResultList();
    }

    public List<Object[]> findLatestSessionByTeamId(Long teamId) {
        return getEntityManager()
                .createQuery(
                        "SELECT u.username as username, MAX(s.lastRequest) as lastRequest "
                                + "FROM stirling.software.proprietary.security.model.User u "
                                + "LEFT JOIN SessionEntity s ON u.username = s.principalName "
                                + "WHERE u.team.id = :teamId "
                                + "GROUP BY u.username",
                        Object[].class)
                .setParameter("teamId", teamId)
                .getResultList();
    }
}
