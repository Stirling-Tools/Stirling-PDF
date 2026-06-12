package stirling.software.common.security;

import java.util.Date;

/**
 * Migration compatibility shim for
 * {@code org.springframework.security.web.authentication.rememberme.PersistentTokenRepository}.
 *
 * <p>Persists the remember-me tokens used by the persistent token based remember-me services.
 */
public interface PersistentTokenRepository {

    void createNewToken(PersistentRememberMeToken token);

    void updateToken(String series, String tokenValue, Date lastUsed);

    PersistentRememberMeToken getTokenForSeries(String seriesId);

    void removeUserTokens(String username);
}
