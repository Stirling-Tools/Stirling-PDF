package stirling.software.SPDF.repository;

import java.util.Date;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;
import org.springframework.security.web.authentication.rememberme.PersistentTokenRepository;

import stirling.software.SPDF.model.PersistentLogin;

public class JPATokenRepositoryImpl implements PersistentTokenRepository {

    @Autowired private PersistentLoginRepository persistentLoginRepository;

    @Override
    public void createNewToken(PersistentRememberMeToken token) {
        PersistentLogin newToken = new PersistentLogin();
        newToken.setSeries(token.getSeries());
        newToken.setUsername(token.getUsername());
        newToken.setToken(token.getTokenValue());
        newToken.setLastUsed(token.getDate());
        persistentLoginRepository.save(newToken);
    }

    @Override
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
    public void removeUserTokens(String username) {
        for (PersistentLogin token : persistentLoginRepository.findAll()) {
            if (token.getUsername().equals(username)) {
                persistentLoginRepository.delete(token);
            }
        }
    }
}
