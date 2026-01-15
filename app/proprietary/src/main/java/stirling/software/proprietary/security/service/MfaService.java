package stirling.software.proprietary.security.service;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

/**
 * Service for managing multi-factor authentication (MFA) settings for users.
 *
 * <p>This service reads and writes MFA-related settings such as secrets, enablement flags, and
 * last-used TOTP steps.
 */
@Service
@RequiredArgsConstructor
public class MfaService {

    public static final String MFA_ENABLED_KEY = "mfaEnabled";
    public static final String MFA_SECRET_KEY = "mfaSecret";
    public static final String MFA_LAST_USED_STEP_KEY = "mfaLastUsedStep";
    public static final String MFA_REQUIRED_KEY = "mfaRequired";

    private final UserRepository userRepository;
    private final DatabaseServiceInterface databaseService;

    /**
     * Determines whether MFA is enabled for the given user.
     *
     * @param user target user
     * @return {@code true} if MFA is enabled
     */
    public boolean isMfaEnabled(User user) {
        String value = getSetting(user, MFA_ENABLED_KEY);
        return Boolean.parseBoolean(value);
    }

    /**
     * Retrieves the MFA secret for the given user.
     *
     * @param user target user
     * @return Base32-encoded secret, or {@code null} if not set
     */
    public String getSecret(User user) {
        return getSetting(user, MFA_SECRET_KEY);
    }

    /**
     * Stores a new MFA secret and marks MFA as pending (disabled) for the user.
     *
     * @param user target user
     * @param secret Base32-encoded secret to store
     * @throws SQLException when database persistence fails
     * @throws UnsupportedProviderException when the database provider is unsupported
     */
    public void setSecret(User user, String secret)
            throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_SECRET_KEY, secret);
        settings.put(MFA_ENABLED_KEY, "false");
        settings.remove(MFA_LAST_USED_STEP_KEY);
        persist(managedUser);
    }

    /**
     * Enables MFA for the given user.
     *
     * @param user target user
     * @throws SQLException when database persistence fails
     * @throws UnsupportedProviderException when the database provider is unsupported
     */
    public void enableMfa(User user) throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_ENABLED_KEY, "true");
        persist(managedUser);
    }

    /**
     * Clears any pending MFA setup data for the user.
     *
     * @param user target user
     * @throws SQLException when database persistence fails
     * @throws UnsupportedProviderException when the database provider is unsupported
     */
    public void clearPendingSecret(User user) throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_ENABLED_KEY, "false");
        settings.remove(MFA_SECRET_KEY);
        settings.remove(MFA_LAST_USED_STEP_KEY);
        persist(managedUser);
    }

    /**
     * Disables MFA and clears stored secrets for the user.
     *
     * @param user target user
     * @throws SQLException when database persistence fails
     * @throws UnsupportedProviderException when the database provider is unsupported
     */
    public void disableMfa(User user) throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_ENABLED_KEY, "false");
        settings.remove(MFA_SECRET_KEY);
        settings.remove(MFA_LAST_USED_STEP_KEY);
        persist(managedUser);
    }

    /**
     * Checks whether a TOTP time step has not been used before.
     *
     * @param user target user
     * @param timeStep candidate TOTP time step
     * @return {@code true} if the time step is usable
     */
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

    /**
     * Marks a TOTP time step as used, preventing replay.
     *
     * @param user target user
     * @param timeStep time step to mark as used
     * @return {@code true} if the time step was marked, {@code false} if it was already used
     * @throws SQLException when database persistence fails
     * @throws UnsupportedProviderException when the database provider is unsupported
     */
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

    /**
     * Determines whether MFA is required for the given user.
     *
     * @param user target user
     * @return {@code true} if MFA is required
     */
    public boolean isMfaRequired(User user) {
        String value = getSetting(user, MFA_REQUIRED_KEY);
        return Boolean.parseBoolean(value);
    }

    /**
     * Sets whether MFA is required for the given user.
     *
     * @param user target user
     * @param required {@code true} to require MFA
     * @throws SQLException when database persistence fails
     * @throws UnsupportedProviderException when the database provider is unsupported
     */
    public void setMfaRequired(User user, boolean required)
            throws SQLException, UnsupportedProviderException {
        User managedUser = getUserWithSettings(user);
        Map<String, String> settings = ensureSettings(managedUser);
        settings.put(MFA_REQUIRED_KEY, Boolean.toString(required));
        persist(managedUser);
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
