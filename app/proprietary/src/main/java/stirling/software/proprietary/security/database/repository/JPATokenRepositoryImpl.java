package stirling.software.proprietary.security.database.repository;

import java.util.Date;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

// TODO: Migration required - this class implements Spring Security's
// org.springframework.security.web.authentication.rememberme.PersistentTokenRepository
// (remember-me persistent login) and exchanges
// org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken
// objects. Quarkus has no direct remember-me equivalent. The OpenSAML/JWT logic here is
// trivial token persistence, so the body is preserved unchanged. Once the remember-me
// mechanism is rehosted (custom Quarkus form-auth + persistent token store, or quarkus-oidc
// session), re-implement the interface against the new abstraction. The Spring Security
// imports below are intentionally KEPT until that abstraction exists.
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;

import stirling.software.proprietary.security.model.PersistentLogin;

@ApplicationScoped
public class JPATokenRepositoryImpl implements PersistentTokenRepository {

    private final PersistentLoginRepository persistentLoginRepository;

    @Inject
    public JPATokenRepositoryImpl(PersistentLoginRepository persistentLoginRepository) {
        this.persistentLoginRepository = persistentLoginRepository;
    }

    @Override
    @Transactional
    public void createNewToken(PersistentRememberMeToken token) {
        PersistentLogin newToken = new PersistentLogin();
        newToken.setSeries(token.getSeries());
        newToken.setUsername(token.getUsername());
        newToken.setToken(token.getTokenValue());
        newToken.setLastUsed(token.getDate().toInstant());
        // TODO: Migration required - PersistentLoginRepository is a collaborator that is not
        // yet migrated to Quarkus Panache. Once it extends PanacheRepositoryBase, replace
        // save(...) with persist(...).
        persistentLoginRepository.save(newToken);
    }

    @Override
    @Transactional
    public void updateToken(String series, String tokenValue, Date lastUsed) {
        PersistentLogin existingToken = persistentLoginRepository.findById(series).orElse(null);
        if (existingToken != null) {
            existingToken.setToken(tokenValue);
            existingToken.setLastUsed(lastUsed.toInstant());
            persistentLoginRepository.save(existingToken);
        }
    }

    @Override
    public PersistentRememberMeToken getTokenForSeries(String seriesId) {
        PersistentLogin token = persistentLoginRepository.findById(seriesId).orElse(null);
        if (token != null) {
            return new PersistentRememberMeToken(
                    token.getUsername(),
                    token.getSeries(),
                    token.getToken(),
                    Date.from(token.getLastUsed()));
        }
        return null;
    }

    @Override
    @Transactional
    public void removeUserTokens(String username) {
        try {
            persistentLoginRepository.deleteByUsername(username);
        } catch (Exception e) {
        }
    }
}
