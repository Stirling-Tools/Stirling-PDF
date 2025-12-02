package stirling.software.proprietary.security.database.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsernameIgnoreCase(String username);

    @Query("FROM User u LEFT JOIN FETCH u.settings where upper(u.username) = upper(:username)")
    Optional<User> findByUsernameIgnoreCaseWithSettings(@Param("username") String username);

    Optional<User> findByUsername(String username);

    Optional<User> findByApiKey(String apiKey);

    Optional<User> findBySsoProviderAndSsoProviderId(String ssoProvider, String ssoProviderId);

    List<User> findByAuthenticationTypeIgnoreCase(String authenticationType);

    @Query("SELECT u FROM User u WHERE u.team IS NULL")
    List<User> findAllWithoutTeam();

    @Query(value = "SELECT u FROM User u LEFT JOIN FETCH u.team")
    List<User> findAllWithTeam();

    @Query(
            "SELECT u FROM User u JOIN FETCH u.authorities JOIN FETCH u.team WHERE u.team.id = :teamId")
    List<User> findAllByTeamId(@Param("teamId") Long teamId);

    long countByTeam(Team team);

    List<User> findAllByTeam(Team team);

    // OAuth grandfathering queries
    long countBySsoProviderIsNotNull();

    long countByOauthGrandfatheredTrue();

    List<User> findAllBySsoProviderIsNotNull();

    /**
     * Finds all SSO users - those with sso_provider set OR authenticationType is sso/oauth2/saml2.
     * This catches V1 users who were created via SSO but never signed in (sso_provider is null).
     */
    @Query(
            "SELECT u FROM User u WHERE u.ssoProvider IS NOT NULL "
                    + "OR LOWER(u.authenticationType) IN ('sso', 'oauth2', 'saml2')")
    List<User> findAllSsoUsers();

    /**
     * Finds SSO users who have never created a session (pending activation) and are not yet
     * grandfathered.
     */
    @Query(
            "SELECT u FROM User u "
                    + "LEFT JOIN SessionEntity s ON u.username = s.principalName "
                    + "WHERE (u.ssoProvider IS NOT NULL "
                    + "OR LOWER(u.authenticationType) IN ('sso', 'oauth2', 'saml2')) "
                    + "AND (u.oauthGrandfathered IS NULL OR u.oauthGrandfathered = false) "
                    + "AND s.sessionId IS NULL")
    List<User> findPendingSsoUsersWithoutSession();

    /**
     * Counts all SSO users - those with sso_provider set OR authenticationType is sso/oauth2/saml2.
     */
    @Query(
            "SELECT COUNT(u) FROM User u WHERE u.ssoProvider IS NOT NULL "
                    + "OR LOWER(u.authenticationType) IN ('sso', 'oauth2', 'saml2')")
    long countSsoUsers();
}
