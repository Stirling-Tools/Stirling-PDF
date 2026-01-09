package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@Service
@RequiredArgsConstructor
public class MfaService {

    public static final String MFA_ENABLED_KEY = "mfaEnabled";
    public static final String MFA_SECRET_KEY = "mfaSecret";

    private final UserRepository userRepository;
    private final DatabaseServiceInterface databaseService;

    public boolean isMfaEnabled(User user) {
        String value = getSetting(user, MFA_ENABLED_KEY);
        return Boolean.parseBoolean(value);
    }

    public String getSecret(User user) {
        return getSetting(user, MFA_SECRET_KEY);
    }

    public void setSecret(User user, String secret)
            throws SQLException, UnsupportedProviderException {
        Map<String, String> settings = ensureSettings(user);
        settings.put(MFA_SECRET_KEY, secret);
        settings.put(MFA_ENABLED_KEY, "false");
        persist(user);
    }

    public void enableMfa(User user) throws SQLException, UnsupportedProviderException {
        Map<String, String> settings = ensureSettings(user);
        settings.put(MFA_ENABLED_KEY, "true");
        persist(user);
    }

    public void disableMfa(User user) throws SQLException, UnsupportedProviderException {
        Map<String, String> settings = ensureSettings(user);
        settings.put(MFA_ENABLED_KEY, "false");
        settings.remove(MFA_SECRET_KEY);
        persist(user);
    }

    private String getSetting(User user, String key) {
        Map<String, String> settings = user.getSettings();
        if (settings == null) {
            return null;
        }
        return settings.get(key);
    }

    private Map<String, String> ensureSettings(User user) {
        Map<String, String> settings = user.getSettings();
        if (settings == null) {
            settings = new HashMap<>();
            user.setSettings(settings);
        }
        return settings;
    }

    private void persist(User user) throws SQLException, UnsupportedProviderException {
        userRepository.save(user);
        databaseService.exportDatabase();
    }
}
