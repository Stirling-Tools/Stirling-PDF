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
    public static final String MFA_LAST_USED_STEP_KEY = "mfaLastUsedStep";

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
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_SECRET_KEY, secret);
        settings.put(MFA_ENABLED_KEY, "false");
        settings.remove(MFA_LAST_USED_STEP_KEY);
        persist(managedUser);
    }

    public void enableMfa(User user) throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_ENABLED_KEY, "true");
        persist(managedUser);
    }

    public void clearPendingSecret(User user) throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_ENABLED_KEY, "false");
        settings.remove(MFA_SECRET_KEY);
        settings.remove(MFA_LAST_USED_STEP_KEY);
        persist(managedUser);
    }

    public void disableMfa(User user) throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_ENABLED_KEY, "false");
        settings.remove(MFA_SECRET_KEY);
        settings.remove(MFA_LAST_USED_STEP_KEY);
        persist(managedUser);
    }

    public boolean isTotpStepUsable(User user, long timeStep) {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = managedUser.getSettings();
        if (settings == null) {
            return true;
        }
        String lastUsed = settings.get(MFA_LAST_USED_STEP_KEY);
        if (lastUsed == null) {
            return true;
        }
        try {
            long lastUsedStep = Long.parseLong(lastUsed);
            return timeStep > lastUsedStep;
        } catch (NumberFormatException ignored) {
            return true;
        }
    }

    public boolean markTotpStepUsed(User user, long timeStep)
            throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        String lastUsed = settings.get(MFA_LAST_USED_STEP_KEY);
        if (lastUsed != null) {
            try {
                long lastUsedStep = Long.parseLong(lastUsed);
                if (timeStep <= lastUsedStep) {
                    return false;
                }
            } catch (NumberFormatException ignored) {
                // treat malformed value as unused
            }
        }
        settings.put(MFA_LAST_USED_STEP_KEY, Long.toString(timeStep));
        persist(managedUser);
        return true;
    }

    private String getSetting(User user, String key) {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = managedUser.getSettings();
        if (settings == null) {
            return null;
        }
        return settings.get(key);
    }

    private User getUserWithSettings(User user) {
        if (user == null || user.getId() == null) {
            return user;
        }
        return userRepository.findByIdWithSettings(user.getId()).orElse(user);
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
