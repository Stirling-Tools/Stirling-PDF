package stirling.software.SPDF.repository;

import java.util.Date;

import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.SPDF.model.PersistentLogin;

public class JPATokenRepositoryImpl implements PersistentTokenRepository {

    private final PersistentLoginRepository persistentLoginRepository;

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
        newToken.setLastUsed(token.getDate());
        persistentLoginRepository.save(newToken);
    }

    @Override
    @Transactional
    public void updateToken(String series, String tokenValue, Date lastUsed) {
        PersistentLogin existingToken = persistentLoginRepository.findById(series).orElse(null);
        if (existingToken != null) {
            existingToken.setToken(tokenValue);
            existingToken.setLastUsed(lastUsed);
            persistentLoginRepository.save(existingToken);
        }
    }

    @Override
    public PersistentRememberMeToken getTokenForSeries(String seriesId) {
        PersistentLogin token = persistentLoginRepository.findById(seriesId).orElse(null);
        if (token != null) {
            return new PersistentRememberMeToken(
                    token.getUsername(), token.getSeries(), token.getToken(), token.getLastUsed());
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
