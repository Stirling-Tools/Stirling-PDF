package stirling.software.proprietary.security.database.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

/**
 * Quarkus Panache repository for {@link User}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<User, Long>}. Derived finders are
 * reimplemented as Panache queries and the {@code @Query} methods keep their original JPQL/native
 * strings passed to Panache {@code find}/{@code getEntityManager().createNativeQuery(...)}.
 */
@ApplicationScoped
public class UserRepository implements PanacheRepositoryBase<User, Long> {

    public Optional<User> findByUsernameIgnoreCase(String username) {
        return find("upper(username) = upper(?1)", username).firstResultOptional();
    }

    public Optional<User> findByUsernameIgnoreCaseWithSettings(String username) {
        return find(
                        "FROM User u LEFT JOIN FETCH u.settings where upper(u.username) = upper(?1)",
                        username)
                .firstResultOptional();
    }

    public Optional<User> findByIdWithSettings(Long id) {
        return find("FROM User u LEFT JOIN FETCH u.settings where u.id = ?1", id)
                .firstResultOptional();
    }

    public Optional<User> findByUsername(String username) {
        return find("username", username).firstResultOptional();
    }

    public Optional<User> findByApiKey(String apiKey) {
        return find("apiKey", apiKey).firstResultOptional();
    }

    public Optional<User> findByEmail(String email) {
        return find("email", email).firstResultOptional();
    }

    public Optional<User> findBySupabaseId(UUID supabaseId) {
        return find("supabaseId", supabaseId).firstResultOptional();
    }

    public Optional<User> findBySsoProviderAndSsoProviderId(
            String ssoProvider, String ssoProviderId) {
        return find("ssoProvider = ?1 and ssoProviderId = ?2", ssoProvider, ssoProviderId)
                .firstResultOptional();
    }

    public List<User> findByAuthenticationTypeIgnoreCase(String authenticationType) {
        return list("upper(authenticationType) = upper(?1)", authenticationType);
    }

    public List<User> findAllWithoutTeam() {
        return list("SELECT u FROM User u WHERE u.team IS NULL");
    }

    public List<User> findAllWithTeam() {
        return list("SELECT u FROM User u LEFT JOIN FETCH u.team");
    }

    public List<User> findAllByTeamId(Long teamId) {
        return list(
                "SELECT u FROM User u JOIN FETCH u.authorities JOIN FETCH u.team WHERE u.team.id ="
                        + " ?1",
                teamId);
    }

    public long countByTeam(Team team) {
        return count("team", team);
    }

    public List<User> findAllByTeam(Team team) {
        return list("team", team);
    }

    // OAuth grandfathering queries
    public long countBySsoProviderIsNotNull() {
        return count("ssoProvider IS NOT NULL");
    }

    public long countByOauthGrandfatheredTrue() {
        return count("oauthGrandfathered = true");
    }

    public List<User> findAllBySsoProviderIsNotNull() {
        return list("ssoProvider IS NOT NULL");
    }

    /**
     * Finds all SSO users - those with sso_provider set OR authenticationType is sso/oauth2/saml2.
     * This catches V1 users who were created via SSO but never signed in (sso_provider is null).
     */
    public List<User> findAllSsoUsers() {
        return list(
                "SELECT u FROM User u WHERE u.ssoProvider IS NOT NULL "
                        + "OR LOWER(u.authenticationType) IN ('sso', 'oauth2', 'saml2')");
    }

    /**
     * Finds SSO users who have never created a session (pending activation) and are not yet
     * grandfathered.
     */
    public List<User> findPendingSsoUsersWithoutSession() {
        return list(
                "SELECT u FROM User u "
                        + "LEFT JOIN SessionEntity s ON u.username = s.principalName "
                        + "WHERE (u.ssoProvider IS NOT NULL "
                        + "OR LOWER(u.authenticationType) IN ('sso', 'oauth2', 'saml2')) "
                        + "AND (u.oauthGrandfathered IS NULL OR u.oauthGrandfathered = false) "
                        + "AND s.sessionId IS NULL");
    }

    /**
     * Counts all SSO users - those with sso_provider set OR authenticationType is sso/oauth2/saml2.
     */
    public long countSsoUsers() {
        return count(
                "ssoProvider IS NOT NULL "
                        + "OR LOWER(authenticationType) IN ('sso', 'oauth2', 'saml2')");
    }

    public long countUsersBySetting(String key, String value) {
        return count(
                "SELECT COUNT(u) FROM User u JOIN u.settings settings "
                        + "WHERE KEY(settings) = ?1 AND settings = ?2",
                key,
                value);
    }

    @Transactional
    public void deleteSettingsByUserIdAndKeys(Long userId, List<String> keys) {
        getEntityManager()
                .createNativeQuery(
                        "DELETE FROM user_settings WHERE user_id = :userId AND setting_key IN"
                                + " (:keys)")
                .setParameter("userId", userId)
                .setParameter("keys", keys)
                .executeUpdate();
    }

    /** Anonymous users (no username) created before the cut-off, streamed for batch cleanup. */
    public Stream<Long> findByUsernameIsNullAndCreatedAtBefore(LocalDateTime cutoffDate) {
        return getEntityManager()
                .createQuery(
                        "SELECT u.id FROM User u WHERE u.username IS NULL AND u.createdAt <"
                                + " :cutoffDate",
                        Long.class)
                .setParameter("cutoffDate", cutoffDate)
                .getResultStream();
    }

    /** Single-shot UPDATE that reassigns a user to a different team. */
    @Transactional
    public int updateUserTeamId(Long userId, Long teamId) {
        return update("team.id = ?1 WHERE id = ?2", teamId, userId);
    }
}
