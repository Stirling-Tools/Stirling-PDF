package stirling.software.proprietary.security.database.repository;

import java.util.Date;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import stirling.software.common.security.PersistentRememberMeToken;
import stirling.software.common.security.PersistentTokenRepository;

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
