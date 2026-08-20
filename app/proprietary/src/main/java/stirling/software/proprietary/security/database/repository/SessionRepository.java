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

    /** Latest request instant per principal. */
    public List<Object[]> findLatestRequestPerPrincipal() {
        return getEntityManager()
                .createQuery(
                        "SELECT s.principalName, MAX(s.lastRequest) FROM SessionEntity s GROUP BY"
                                + " s.principalName",
                        Object[].class)
                .getResultList();
    }

    /** Principals with a live (non-expired, within-window) session. */
    public List<String> findActivePrincipalsSince(Instant cutoff) {
        return getEntityManager()
                .createQuery(
                        "SELECT DISTINCT s.principalName FROM SessionEntity s "
                                + "WHERE s.expired = false AND s.lastRequest > :cutoff",
                        String.class)
                .setParameter("cutoff", cutoff)
                .getResultList();
    }

    /** Flag timed-out sessions as expired. */
    @Transactional
    public int expireOlderThan(Instant cutoff) {
        return update("expired = true WHERE expired = false AND lastRequest < ?1", cutoff);
    }

    /** Purge long-expired sessions to bound table growth. */
    @Transactional
    public int deleteExpiredOlderThan(Instant cutoff) {
        return (int) delete("expired = true AND lastRequest < ?1", cutoff);
    }
}
