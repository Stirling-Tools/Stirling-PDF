package stirling.software.proprietary.service;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.accountlink.EntitlementCache;
import stirling.software.proprietary.accountlink.InstanceEntitlement;
import stirling.software.proprietary.model.UserLicenseSettings;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.model.User;
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

    /**
     * Users an installation gets before it has to buy capacity. The one free-allowance number in
     * Java: the saas seat reader floors on it, the cloud wallet reports it, and {@code
     * pricing_policy.server_free_user_allowance} is seeded to match.
     */
    public static final int DEFAULT_USER_LIMIT = 5;

    private static final String SIGNATURE_SEPARATOR = ":";
    private static final String DEFAULT_INTEGRITY_SECRET = "stirling-pdf-user-license-guard";

    private final UserLicenseSettingsRepository settingsRepository;
    private final UserService userService;
    private final ApplicationProperties applicationProperties;
    private final ObjectProvider<LicenseKeyChecker> licenseKeyChecker;

    /** Absent unless this instance is linked to SaaS (account-link disabled by default). */
    private final ObjectProvider<EntitlementCache> entitlementCache;

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
     *
     * <p>Keyed on the licence <i>key</i>'s tier, not on the effective one: {@code premium.maxUsers}
     * is a figure only a licence carries, and a Team plan bought in the cloud leaves it unset.
     * Reading the effective tier would store 0 for such an instance, which {@link
     * #calculateMaxAllowedUsers()} reads as "SERVER licence, unlimited users".
     */
    @Transactional
    public void updateLicenseMaxUsers() {
        UserLicenseSettings settings = getOrCreateSettings();

        int licenseMaxUsers = 0;
        if (hasLicenseKeyPaidTier()) {
            licenseMaxUsers = applicationProperties.getPremium().getMaxUsers();
        }

        if (settings.getLicenseMaxUsers() != licenseMaxUsers) {
            settings.setLicenseMaxUsers(licenseMaxUsers);
            settingsRepository.save(settings);
            log.info("Updated license max users to: {}", licenseMaxUsers);
        }
    }

    /**
     * Grandfathers existing OAuth users on first run. This is a one-time migration that marks all
     * existing OAuth/SAML users as grandfathered, allowing them to keep OAuth access even without a
     * paid license.
     *
     * <p>New users created after this migration will NOT be grandfathered and will require a paid
     * license to use OAuth.
     */
    @Transactional
    public void grandfatherExistingOAuthUsers() {
        // Only grandfather users if this is a V1→V2 upgrade, not a fresh V2 install
        Boolean isNewServer = applicationProperties.getAutomaticallyGenerated().getIsNewServer();
        if (Boolean.TRUE.equals(isNewServer)) {
            log.info("Fresh V2 installation detected - skipping OAuth user grandfathering");
            return;
        }

        UserLicenseSettings settings = getOrCreateSettings();

        // Check if we've already run this migration
        if (settings.getId() != null && settings.isGrandfatheringLocked()) {
            // Migration should happen at the same time as grandfathering is locked
            long oauthUsersCount = userService.countOAuthUsers();
            long grandfatheredCount = userService.countGrandfatheredOAuthUsers();

            if (oauthUsersCount > 0 && grandfatheredCount == 0) {
                // We have OAuth users but none are grandfathered - this is first run after upgrade
                int updated = userService.grandfatherAllOAuthUsers();
                log.warn(
                        "OAuth GRANDFATHERING: Marked {} existing OAuth/SAML users as grandfathered. "
                                + "They will retain OAuth access even without a paid license. "
                                + "New users will require a paid license for OAuth.",
                        updated);
            }

            // Grandfather pending users (invited but never logged in)
            // The query filters to non-grandfathered users only, so this is idempotent
            if (grandfatheredCount > 0 || oauthUsersCount > 0) {
                int pendingUpdated = userService.grandfatherPendingSsoUsersWithoutSession();
                if (pendingUpdated > 0) {
                    log.warn(
                            "OAuth GRANDFATHERING: Marked {} pending SSO users (no prior sessions) as"
                                    + " grandfathered.",
                            pendingUpdated);
                }
            }
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
     *   <li>Grandfathered limit = max(5, existing user count at V1→V2 migration)
     *   <li>No license, not linked: Uses grandfathered limit only
     *   <li>No license, linked: max(grandfathered limit, the linked team's allowance)
     *   <li>SERVER license (maxUsers=0): Unlimited users (Integer.MAX_VALUE)
     *   <li>ENTERPRISE license (maxUsers>0): License seats only (NO grandfathering added)
     * </ul>
     *
     * <p>IMPORTANT: Paid licenses REPLACE the limit, they don't add to grandfathering. A linked
     * team's allowance does not: linking is monotonic, so it can only raise the ceiling.
     *
     * <p>The branch is chosen by whether a licence <i>key</i> is installed, never by the effective
     * tier. A Team plan bought in the cloud promotes the effective tier to SERVER without carrying
     * a {@code premium.maxUsers}, so branching on the effective tier would read the stored 0 as
     * "SERVER licence, unlimited" and hand a customer who bought 100 users no limit at all.
     *
     * @return Maximum number of users allowed (Integer.MAX_VALUE for unlimited)
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

        // A valid licence answers first. Team is moving to being sold on SaaS with no licence at
        // all, so in the end state only Enterprise holds one, and Enterprise should outrank SaaS:
        // it is contracted and has to keep working offline. Until then a legacy licence keeps
        // whatever it granted, and a customer worse off under it can simply remove it.
        if (!hasLicenseKeyPaidTier()) {
            Integer fromSaas = linkedTeamAllowance();
            if (fromSaas != null) {
                // Floored at the grandfathered limit, so linking can only raise the ceiling.
                // Otherwise a solo cloud account, whose team the instance binds to before any
                // invitation is accepted, hands back its own seat count and refuses every user.
                int allowed = Math.max(grandfatheredLimit, fromSaas);
                log.debug(
                        "No licence; linked team allowance {} against grandfathered {}: {} users",
                        fromSaas,
                        grandfatheredLimit,
                        allowed);
                return allowed;
            }
            log.debug("No license: using grandfathered limit of {}", grandfatheredLimit);
            return grandfatheredLimit;
        }

        int licenseMaxUsers = settings.getLicenseMaxUsers();

        // SERVER license (maxUsers=0): unlimited users
        if (licenseMaxUsers == 0) {
            log.debug("SERVER license: unlimited users allowed");
            return Integer.MAX_VALUE;
        }

        // ENTERPRISE license (maxUsers>0): license seats only (replaces grandfathering)
        log.debug(
                "ENTERPRISE license: {} seats (grandfathered {} not added)",
                licenseMaxUsers,
                grandfatheredLimit);
        return licenseMaxUsers;
    }

    /**
     * Users this instance's linked team is entitled to, or null when SaaS is not the authority
     * here.
     *
     * <p>Only consulted when no licence is installed. Null covers three indistinguishable cases
     * that all fall through to the grandfathered limit: the instance is not linked, SaaS has never
     * answered, or it answered with no user limit — which is also what an older SaaS sends.
     *
     * <p>Falls back to the value {@link #refreshLinkedTeamUsers()} stored, so an instance that
     * boots offline keeps the allowance it was last told about instead of dropping its users to the
     * grandfathered limit. When SaaS is merely unreachable {@link EntitlementCache} answers from
     * the freshest snapshot it has, and this fallback covers the boot before it has one.
     */
    private Integer linkedTeamAllowance() {
        Integer live = currentEntitlement().map(InstanceEntitlement::licensedUsers).orElse(null);
        return live != null ? live : getOrCreateSettings().getLinkedTeamUsers();
    }

    /** The linked team's entitlement, or empty when unlinked or never yet fetched. */
    private Optional<InstanceEntitlement> currentEntitlement() {
        EntitlementCache cache = entitlementCache.getIfAvailable();
        return cache == null ? Optional.empty() : cache.current();
    }

    /**
     * Records the linked team's purchased user allowance on the licence row and returns it, or
     * returns the stored value when SaaS has said nothing.
     *
     * <p>Called from the licence sync, which is what makes the stored value SaaS-derived rather
     * than a local claim: a plan that lapses comes back as no allowance and clears the column.
     * Nothing is written when there is no entitlement to write — an unlinked instance and an
     * unreachable SaaS look identical from here, and clearing on the second would revoke a paid
     * customer's capacity for the length of an outage.
     *
     * <p>Not transactional: asking the cache can mean an HTTP round trip to SaaS, and there is no
     * invariant here worth holding a database connection across one. The single conditional write
     * carries its own transaction.
     *
     * @return users the linked team has bought, or null when it has bought none
     */
    public Integer refreshLinkedTeamUsers() {
        Optional<InstanceEntitlement> answer = currentEntitlement();
        UserLicenseSettings settings = getOrCreateSettings();
        if (answer.isEmpty()) {
            return settings.getLinkedTeamUsers();
        }
        Integer purchased = answer.get().licensedUsers();
        if (!Objects.equals(settings.getLinkedTeamUsers(), purchased)) {
            settings.setLinkedTeamUsers(purchased);
            settingsRepository.save(settings);
            log.info("Linked team user allowance is now {}", purchased);
        }
        return purchased;
    }

    /**
     * Checks if a user is eligible to use OAuth/SAML authentication.
     *
     * <p>A user is eligible if:
     *
     * <ul>
     *   <li>They are grandfathered for OAuth (existing user before policy change), OR
     *   <li>The system has an ENTERPRISE license (SSO is enterprise-only)
     * </ul>
     *
     * @param user The user to check
     * @return true if the user can use OAuth/SAML
     */
    public boolean isOAuthEligible(User user) {
        String username = (user != null) ? user.getUsername() : "<new user>";
        log.info("OAuth eligibility check for user: {}", username);

        // Check license first - if paying, they're eligible (no need to check grandfathering)
        boolean hasPaid = hasPaidLicense();
        if (hasPaid) {
            log.debug("User {} eligible for OAuth via paid license", username);
            return true;
        }

        // No license - check if grandfathered (fallback for V1 users)
        if (user != null && user.isOauthGrandfathered()) {
            log.info("User {} eligible for OAuth via grandfathering (no paid license)", username);
            return true;
        }

        // Not grandfathered and no license
        log.info("User {} NOT eligible for OAuth: no paid license and not grandfathered", username);
        return false;
    }

    /**
     * Checks if a user is eligible to use SAML authentication.
     *
     * <p>A user is eligible if:
     *
     * <ul>
     *   <li>They are grandfathered for OAuth (existing user before policy change), OR
     *   <li>The system has an ENTERPRISE license (SAML is enterprise-only)
     * </ul>
     *
     * @param user The user to check
     * @return true if the user can use SAML
     */
    public boolean isSamlEligible(User user) {
        String username = (user != null) ? user.getUsername() : "<new user>";
        log.info("SAML2 eligibility check for user: {}", username);

        // Check license first - if paying, they're eligible (no need to check grandfathering)
        boolean hasEnterprise = hasEnterpriseLicense();
        if (hasEnterprise) {
            log.debug("User {} eligible for SAML2 via ENTERPRISE license", username);
            return true;
        }

        // No license - check if grandfathered (fallback for V1 users)
        if (user != null && user.isOauthGrandfathered()) {
            log.info(
                    "User {} eligible for SAML2 via grandfathering (no ENTERPRISE license)",
                    username);
            return true;
        }

        // Not grandfathered and no license
        log.info(
                "User {} NOT eligible for SAML2: no ENTERPRISE license and not grandfathered",
                username);
        return false;
    }

    /**
     * Serialises user admission against the licensed limit.
     *
     * <p>Takes a write lock on the licence row, held until the caller's transaction commits. The
     * count in {@link #wouldExceedLimit(int)} is only meaningful while nobody else can insert a
     * user, so a caller must take this lock first and perform its insert in the same transaction.
     * Declared {@code MANDATORY} because joining the caller's transaction is the whole point: in a
     * transaction of its own the lock would be released immediately and admission would silently go
     * back to being racy.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockForUserAdmission() {
        settingsRepository.lockSettings();
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

        if (builder.isEmpty()) {
            builder.append(DEFAULT_INTEGRITY_SECRET);
        }

        return builder.toString();
    }

    private void appendIfPresent(StringBuilder builder, String value) {
        if (value != null && !value.isBlank()) {
            if (!builder.isEmpty()) {
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

    private boolean hasPaidLicense() {
        LicenseKeyChecker checker = licenseKeyChecker.getIfAvailable();
        if (checker == null) {
            return false;
        }

        License license = checker.getPremiumLicenseEnabledResult();
        boolean hasPaid = (license == License.SERVER || license == License.ENTERPRISE);
        log.info("License check result: type={}, requiresPaid=true, hasPaid={}", license, hasPaid);

        return hasPaid;
    }

    /**
     * Whether an installed licence key alone grants a paid tier.
     *
     * <p>The seat arithmetic needs this rather than {@link #hasPaidLicense()}: the effective tier
     * is also SERVER when the promotion comes from a cloud Team plan, and that plan states its
     * capacity in the entitlement, not in {@code premium.maxUsers}.
     */
    private boolean hasLicenseKeyPaidTier() {
        LicenseKeyChecker checker = licenseKeyChecker.getIfAvailable();
        if (checker == null) {
            return false;
        }
        License license = checker.getLicenseKeyResult();
        return license == License.SERVER || license == License.ENTERPRISE;
    }

    /**
     * Checks if the system has an ENTERPRISE license. Used for enterprise-only features like SSO
     * (OAuth/SAML).
     *
     * @return true if ENTERPRISE license is active
     */
    private boolean hasEnterpriseLicense() {
        LicenseKeyChecker checker = licenseKeyChecker.getIfAvailable();
        if (checker == null) {
            return false;
        }

        License license = checker.getPremiumLicenseEnabledResult();
        log.info(
                "License check result: type={}, requiresEnterprise=true, hasEnterprise={}",
                license,
                (license == License.ENTERPRISE));

        if (license != License.ENTERPRISE) {
            log.warn(
                    "SAML2 requires ENTERPRISE license but found: {}. SAML2 login will be blocked.",
                    license);
        }

        return license == License.ENTERPRISE;
    }
}
