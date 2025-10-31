package stirling.software.proprietary.service;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.UserLicenseSettings;
import stirling.software.proprietary.security.repository.UserLicenseSettingsRepository;
import stirling.software.proprietary.security.service.UserService;

/**
 * Service for managing user license settings and grandfathering logic.
 *
 * <p>User limit calculation:
 *
 * <ul>
 *   <li>Default limit: 5 users
 *   <li>Grandfathered limit: max(5, existing user count at initialization)
 *   <li>With pro license: grandfathered limit + license maxUsers
 *   <li>Without pro license: grandfathered limit
 * </ul>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class UserLicenseSettingsService {

    private static final int DEFAULT_USER_LIMIT = 5;
    private static final String SIGNATURE_SEPARATOR = ":";
    private static final String DEFAULT_INTEGRITY_SECRET = "stirling-pdf-user-license-guard";

    private final UserLicenseSettingsRepository settingsRepository;
    private final UserService userService;
    private final ApplicationProperties applicationProperties;

    /**
     * Gets the current user license settings, creating them if they don't exist.
     *
     * @return The current settings
     */
    @Transactional
    public UserLicenseSettings getOrCreateSettings() {
        return settingsRepository
                .findSettings()
                .orElseGet(
                        () -> {
                            log.info("Initializing user license settings");
                            UserLicenseSettings settings = new UserLicenseSettings();
                            settings.setId(UserLicenseSettings.SINGLETON_ID);
                            settings.setGrandfatheredUserCount(0);
                            settings.setLicenseMaxUsers(0);
                            settings.setGrandfatheringLocked(false);
                            settings.setIntegritySalt(UUID.randomUUID().toString());
                            settings.setGrandfatheredUserSignature("");
                            return settingsRepository.save(settings);
                        });
    }

    /**
     * Initializes the grandfathered user count if not already set. This should be called on
     * application startup.
     *
     * <p>IMPORTANT: Once grandfathering is locked, this value can NEVER be changed. This prevents
     * manipulation by deleting the settings table.
     *
     * <p>Logic:
     *
     * <ul>
     *   <li>If grandfatheringLocked is true: Skip initialization (already set permanently)
     *   <li>If users exist in database: Set to max(5, current user count) - this is an existing
     *       installation
     *   <li>If no users exist: Set to 5 (default) - this is a fresh installation
     *   <li>Lock grandfathering immediately after setting
     * </ul>
     */
    @Transactional
    public void initializeGrandfatheredCount() {
        UserLicenseSettings settings = getOrCreateSettings();

        boolean changed = ensureIntegritySalt(settings);

        // CRITICAL: Never change grandfathering once it's locked
        if (settings.isGrandfatheringLocked()) {
            if (settings.getGrandfatheredUserSignature() == null
                    || settings.getGrandfatheredUserSignature().isBlank()) {
                settings.setGrandfatheredUserSignature(
                        generateSignature(settings.getGrandfatheredUserCount(), settings));
                changed = true;
            }
            if (changed) {
                settingsRepository.save(settings);
            }
            log.debug(
                    "Grandfathering is locked. Current grandfathered count: {}",
                    settings.getGrandfatheredUserCount());
            return;
        }

        // Determine if this is an existing installation or fresh install
        long currentUserCount = userService.getTotalUsersCount();
        boolean isExistingInstallation = currentUserCount > 0;

        int grandfatheredCount;
        if (isExistingInstallation) {
            // Existing installation (v2.0+ or has users) - grandfather current user count
            grandfatheredCount = Math.max(DEFAULT_USER_LIMIT, (int) currentUserCount);
            log.info(
                    "Existing installation detected. Grandfathering {} users (current: {}, minimum:"
                            + " {})",
                    grandfatheredCount,
                    currentUserCount,
                    DEFAULT_USER_LIMIT);
        } else {
            // Fresh installation - set to default
            grandfatheredCount = DEFAULT_USER_LIMIT;
            log.info(
                    "Fresh installation detected. Setting default grandfathered limit: {}",
                    grandfatheredCount);
        }

        // Set and LOCK the grandfathering permanently
        settings.setGrandfatheredUserCount(grandfatheredCount);
        settings.setGrandfatheringLocked(true);
        settings.setGrandfatheredUserSignature(generateSignature(grandfatheredCount, settings));
        settingsRepository.save(settings);

        log.warn(
                "GRANDFATHERING LOCKED: {} users. This value can never be changed.",
                grandfatheredCount);
    }

    /**
     * Updates the license max users from the application properties. This should be called when the
     * license is validated.
     */
    @Transactional
    public void updateLicenseMaxUsers() {
        UserLicenseSettings settings = getOrCreateSettings();

        int licenseMaxUsers = 0;
        if (applicationProperties.getPremium().isEnabled()) {
            licenseMaxUsers = applicationProperties.getPremium().getMaxUsers();
        }

        if (settings.getLicenseMaxUsers() != licenseMaxUsers) {
            settings.setLicenseMaxUsers(licenseMaxUsers);
            settingsRepository.save(settings);
            log.info("Updated license max users to: {}", licenseMaxUsers);
        }
    }

    /**
     * Validates and enforces the integrity of license settings. This ensures that even if someone
     * manually modifies the database, the grandfathering rules are still enforced.
     */
    @Transactional
    public void validateSettingsIntegrity() {
        UserLicenseSettings settings = getOrCreateSettings();
        boolean changed = ensureIntegritySalt(settings);

        Optional<Integer> signedCountOpt = extractSignedCount(settings);
        boolean signatureValid =
                signedCountOpt.isPresent()
                        && signatureMatches(
                                signedCountOpt.get(),
                                settings.getGrandfatheredUserSignature(),
                                settings);

        int targetCount = settings.getGrandfatheredUserCount();
        String targetSignature = settings.getGrandfatheredUserSignature();

        if (!signatureValid) {
            int restoredCount =
                    signedCountOpt.orElseGet(
                            () ->
                                    Math.max(
                                            DEFAULT_USER_LIMIT,
                                            (int) userService.getTotalUsersCount()));
            log.error(
                    "Grandfathered user signature invalid or missing. Restoring locked count to {}.",
                    restoredCount);
            targetCount = restoredCount;
            targetSignature = generateSignature(targetCount, settings);
            changed = true;
        } else {
            int signedCount = signedCountOpt.get();
            if (targetCount != signedCount) {
                log.error(
                        "Grandfathered user count ({}) was modified without signature update. Restoring to {}.",
                        targetCount,
                        signedCount);
                targetCount = signedCount;
                targetSignature = generateSignature(targetCount, settings);
                changed = true;
            }
        }

        if (targetCount < DEFAULT_USER_LIMIT) {
            if (targetCount != DEFAULT_USER_LIMIT) {
                log.warn(
                        "Grandfathered count ({}) is below minimum ({}). Enforcing minimum.",
                        targetCount,
                        DEFAULT_USER_LIMIT);
            }
            targetCount = DEFAULT_USER_LIMIT;
            targetSignature = generateSignature(targetCount, settings);
            changed = true;
        }

        if (targetSignature == null || targetSignature.isBlank()) {
            targetSignature = generateSignature(targetCount, settings);
            changed = true;
        }

        if (changed
                || settings.getGrandfatheredUserCount() != targetCount
                || (targetSignature != null
                        && !targetSignature.equals(settings.getGrandfatheredUserSignature()))) {
            settings.setGrandfatheredUserCount(targetCount);
            settings.setGrandfatheredUserSignature(targetSignature);
            settingsRepository.save(settings);
        }
    }

    /**
     * Calculates the maximum allowed users based on grandfathering rules.
     *
     * <p>Logic:
     *
     * <ul>
     *   <li>Grandfathered limit = max(5, existing user count at initialization)
     *   <li>If premium enabled: total limit = grandfathered limit + license maxUsers
     *   <li>If premium disabled: total limit = grandfathered limit
     * </ul>
     *
     * @return Maximum number of users allowed
     */
    public int calculateMaxAllowedUsers() {
        validateSettingsIntegrity();
        UserLicenseSettings settings = getOrCreateSettings();

        int grandfatheredLimit = settings.getGrandfatheredUserCount();
        if (grandfatheredLimit == 0) {
            // Fallback if not initialized yet - should not happen with validation
            log.warn("Grandfathered limit is 0, using default: {}", DEFAULT_USER_LIMIT);
            grandfatheredLimit = DEFAULT_USER_LIMIT;
        }

        int totalLimit = grandfatheredLimit;

        if (applicationProperties.getPremium().isEnabled()) {
            totalLimit = grandfatheredLimit + settings.getLicenseMaxUsers();
        }

        log.debug(
                "Calculated max allowed users: {} (grandfathered: {}, license: {}, premium enabled: {})",
                totalLimit,
                grandfatheredLimit,
                settings.getLicenseMaxUsers(),
                applicationProperties.getPremium().isEnabled());

        return totalLimit;
    }

    /**
     * Checks if adding new users would exceed the limit.
     *
     * @param newUsersCount Number of new users to add
     * @return true if the addition would exceed the limit
     */
    public boolean wouldExceedLimit(int newUsersCount) {
        long currentUserCount = userService.getTotalUsersCount();
        int maxAllowed = calculateMaxAllowedUsers();
        return (currentUserCount + newUsersCount) > maxAllowed;
    }

    /**
     * Gets the number of available user slots.
     *
     * @return Number of users that can still be added
     */
    public long getAvailableUserSlots() {
        long currentUserCount = userService.getTotalUsersCount();
        int maxAllowed = calculateMaxAllowedUsers();
        return Math.max(0, maxAllowed - currentUserCount);
    }

    /**
     * Gets the grandfathered user count for display purposes. Returns only the excess users beyond
     * the base limit (5).
     *
     * <p>Examples:
     *
     * <ul>
     *   <li>If grandfathered = 5: returns 0 (base amount, nothing special)
     *   <li>If grandfathered = 10: returns 5 (5 extra users)
     *   <li>If grandfathered = 15: returns 10 (10 extra users)
     * </ul>
     *
     * @return Number of grandfathered users beyond the base limit
     */
    public int getDisplayGrandfatheredCount() {
        UserLicenseSettings settings = getOrCreateSettings();
        int totalGrandfathered = settings.getGrandfatheredUserCount();
        return Math.max(0, totalGrandfathered - DEFAULT_USER_LIMIT);
    }

    /** Gets the current settings. */
    public UserLicenseSettings getSettings() {
        return getOrCreateSettings();
    }

    private boolean ensureIntegritySalt(UserLicenseSettings settings) {
        if (settings.getIntegritySalt() == null || settings.getIntegritySalt().isBlank()) {
            settings.setIntegritySalt(UUID.randomUUID().toString());
            return true;
        }
        return false;
    }

    private Optional<Integer> extractSignedCount(UserLicenseSettings settings) {
        String signature = settings.getGrandfatheredUserSignature();
        if (signature == null || signature.isBlank()) {
            return Optional.empty();
        }

        String[] parts = signature.split(SIGNATURE_SEPARATOR, 2);
        if (parts.length != 2) {
            log.warn("Invalid grandfathered user signature format detected");
            return Optional.empty();
        }

        try {
            return Optional.of(Integer.parseInt(parts[0]));
        } catch (NumberFormatException ex) {
            log.warn("Unable to parse grandfathered user signature count", ex);
            return Optional.empty();
        }
    }

    private boolean signatureMatches(int count, String signature, UserLicenseSettings settings) {
        if (signature == null || signature.isBlank()) {
            return false;
        }
        return generateSignature(count, settings).equals(signature);
    }

    private String generateSignature(int count, UserLicenseSettings settings) {
        if (settings.getIntegritySalt() == null || settings.getIntegritySalt().isBlank()) {
            throw new IllegalStateException("Integrity salt must be initialized before signing.");
        }
        String payload = buildSignaturePayload(count, settings.getIntegritySalt());
        String secret = deriveIntegritySecret();
        String digest = computeHmac(payload, secret);
        return count + SIGNATURE_SEPARATOR + digest;
    }

    private String buildSignaturePayload(int count, String salt) {
        return count + SIGNATURE_SEPARATOR + salt;
    }

    private String deriveIntegritySecret() {
        StringBuilder builder = new StringBuilder();
        appendIfPresent(builder, applicationProperties.getAutomaticallyGenerated().getKey());
        appendIfPresent(builder, applicationProperties.getAutomaticallyGenerated().getUUID());
        appendIfPresent(builder, applicationProperties.getPremium().getKey());

        if (builder.length() == 0) {
            builder.append(DEFAULT_INTEGRITY_SECRET);
        }

        return builder.toString();
    }

    private void appendIfPresent(StringBuilder builder, String value) {
        if (value != null && !value.isBlank()) {
            if (builder.length() > 0) {
                builder.append(SIGNATURE_SEPARATOR);
            }
            builder.append(value);
        }
    }

    private String computeHmac(String payload, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec =
                    new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("Failed to compute grandfathered user signature", e);
        } catch (InvalidKeyException e) {
            throw new IllegalStateException("Invalid key for grandfathered user signature", e);
        }
    }
}
