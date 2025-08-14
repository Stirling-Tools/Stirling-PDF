package stirling.software.proprietary.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.AnonymousCreditUsage;
import stirling.software.proprietary.model.ApiCreditConfig;
import stirling.software.proprietary.model.FailureType;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.security.repository.AnonymousCreditUsageRepository;
import stirling.software.proprietary.security.repository.ApiCreditConfigRepository;
import stirling.software.proprietary.security.repository.ApiCreditUsageRepository;
import stirling.software.proprietary.security.model.User;

@Service
@RequiredArgsConstructor
@Slf4j
public class ApiCreditService {

    private final ApiCreditConfigRepository configRepository;
    private final ApiCreditUsageRepository usageRepository;
    private final AnonymousCreditUsageRepository anonymousUsageRepository;

    // In-memory tracking of consecutive failures per user and anonymous users (for simple
    // implementation)
    // TODO: Move to Redis or database for production clustering
    private final ConcurrentHashMap<String, Integer> consecutiveFailures =
            new ConcurrentHashMap<>();

    @Value("${api.credit-system.anonymous.enabled:true}")
    private boolean anonymousCreditSystemEnabled;

    @Value("${api.credit-system.anonymous.monthly-credits:10}")
    private int anonymousMonthlyCredits;

    @Value("${api.credit-system.anonymous.abuse-threshold:3}")
    private int abuseThreshold;

    public record CreditStatus(
            boolean allowed,
            int creditsConsumed,
            int monthlyCredits,
            int remaining,
            String scope,
            String reason) {}

    public record CreditMetrics(
            int creditsConsumed,
            int monthlyCredits,
            int remaining,
            String scope,
            YearMonth month,
            boolean isPooled) {}

    // TODO: improve with Redis and async in future V2.1
    @Transactional
    public CreditStatus checkAndConsumeCredits(User user, int creditCost) {
        if (user == null) {
            return new CreditStatus(false, 0, 0, 0, "NONE", "No user provided");
        }

        Organization org = user.getOrganization();
        String roleName = user.getRoleName();
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);

        Optional<ApiCreditConfig> configOpt = resolveEffectiveConfig(user, org, roleName);

        if (configOpt.isEmpty()) {
            log.warn(
                    "No credit config found for user: {}, org: {}, role: {}",
                    user.getUsername(),
                    org != null ? org.getName() : "null",
                    roleName);
            return new CreditStatus(
                    true,
                    0,
                    Integer.MAX_VALUE,
                    Integer.MAX_VALUE,
                    "UNLIMITED",
                    "No credit limit configured");
        }

        ApiCreditConfig config = configOpt.get();

        if (!config.getIsActive()) {
            return new CreditStatus(
                    true,
                    0,
                    Integer.MAX_VALUE,
                    Integer.MAX_VALUE,
                    "DISABLED",
                    "Credit system disabled");
        }

        String scope = determineScope(config);
        int monthlyCredits = config.getMonthlyCredits();

        boolean success;
        int currentCreditsConsumed;

        switch (config.getScopeType()) {
            case USER -> {
                success =
                        usageRepository.consumeUserCredits(
                                user, currentMonth, creditCost, monthlyCredits);
                currentCreditsConsumed = usageRepository.getUserCreditsConsumed(user, currentMonth);
            }
            case ORGANIZATION -> {
                if (org == null) {
                    return new CreditStatus(
                            false,
                            0,
                            0,
                            0,
                            scope,
                            "User has no organization but org-level limit is configured");
                }
                boolean pooled = Boolean.TRUE.equals(config.getIsPooled());
                if (pooled) {
                    success =
                            usageRepository.consumeOrgCredits(
                                    org, currentMonth, creditCost, monthlyCredits);
                    currentCreditsConsumed =
                            usageRepository.getOrgCreditsConsumed(org, currentMonth);
                } else {
                    success =
                            usageRepository.consumeUserCredits(
                                    user, currentMonth, creditCost, monthlyCredits);
                    currentCreditsConsumed =
                            usageRepository.getUserCreditsConsumed(user, currentMonth);
                }
            }
            case ROLE_DEFAULT -> {
                // Role defaults are per-user (not pooled)
                success =
                        usageRepository.consumeUserCredits(
                                user, currentMonth, creditCost, monthlyCredits);
                currentCreditsConsumed = usageRepository.getUserCreditsConsumed(user, currentMonth);
            }
            default -> {
                log.error("Unexpected scope type: {}", config.getScopeType());
                return new CreditStatus(false, 0, 0, 0, scope, "Invalid configuration");
            }
        }

        int remaining = Math.max(0, monthlyCredits - currentCreditsConsumed);

        if (!success) {
            return new CreditStatus(
                    false,
                    currentCreditsConsumed,
                    monthlyCredits,
                    remaining,
                    scope,
                    String.format(
                            "Monthly credit limit of %d would be exceeded. "
                                    + "Current consumption: %d, requested: %d",
                            monthlyCredits, currentCreditsConsumed, creditCost));
        }

        return new CreditStatus(
                true, currentCreditsConsumed, monthlyCredits, remaining, scope, "Success");
    }

    @Transactional
    public CreditStatus checkAndConsumeAnonymousCredits(
            String ipAddress, String userAgent, int creditCost) {
        if (!anonymousCreditSystemEnabled) {
            return new CreditStatus(
                    true,
                    0,
                    Integer.MAX_VALUE,
                    Integer.MAX_VALUE,
                    "DISABLED",
                    "Anonymous credit system disabled");
        }

        String fingerprint = generateFingerprint(ipAddress, userAgent);
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);

        // Try to consume credits atomically
        boolean success = anonymousUsageRepository.consumeAnonymousCredits(
                fingerprint, currentMonth, creditCost, anonymousMonthlyCredits, ipAddress, userAgent);

        // Get current usage state for response
        Optional<AnonymousCreditUsage> usageOpt = 
                anonymousUsageRepository.findByFingerprintAndMonth(fingerprint, currentMonth);

        if (usageOpt.isEmpty()) {
            // This shouldn't happen but handle gracefully
            return new CreditStatus(false, 0, anonymousMonthlyCredits, anonymousMonthlyCredits, "ANONYMOUS", "Unknown error");
        }

        AnonymousCreditUsage usage = usageOpt.get();

        if (Boolean.TRUE.equals(usage.getIsBlocked())) {
            return new CreditStatus(
                    false,
                    usage.getCreditsConsumed(),
                    usage.getCreditsAllocated(),
                    usage.getRemainingCredits(),
                    "ANONYMOUS",
                    "IP address is blocked due to abuse");
        }

        if (!success) {
            // Credit consumption failed - handle abuse scoring
            usage.setAbuseScore(usage.getAbuseScore() + 1);
            if (usage.getAbuseScore() >= abuseThreshold) {
                usage.setIsBlocked(true);
                log.warn(
                        "Blocking anonymous user {} due to abuse score: {}",
                        fingerprint,
                        usage.getAbuseScore());
            }
            anonymousUsageRepository.save(usage);

            return new CreditStatus(
                    false,
                    usage.getCreditsConsumed(),
                    usage.getCreditsAllocated(),
                    usage.getRemainingCredits(),
                    "ANONYMOUS",
                    String.format(
                            "Monthly credit limit of %d exceeded. Current consumption: %d",
                            usage.getCreditsAllocated(), usage.getCreditsConsumed()));
        }

        // Success - return updated metrics
        return new CreditStatus(
                true,
                usage.getCreditsConsumed(),
                usage.getCreditsAllocated(),
                usage.getRemainingCredits(),
                "ANONYMOUS",
                "Success");
    }

    public Optional<ApiCreditConfig> resolveEffectiveConfig(
            User user, Organization org, String roleName) {
        // 1. User-specific config (highest priority)
        Optional<ApiCreditConfig> userConfig = configRepository.findByUserAndIsActiveTrue(user);
        if (userConfig.isPresent()) {
            return userConfig;
        }

        // 2. Organization config (if user belongs to org)
        if (org != null) {
            Optional<ApiCreditConfig> orgConfig =
                    configRepository.findByOrganizationAndIsActiveTrue(org);
            if (orgConfig.isPresent()) {
                return orgConfig;
            }
        }

        // 3. Role default config (lowest priority)
        return configRepository.findDefaultForRole(roleName);
    }

    public void createOrUpdateRoleDefault(String roleName, int monthlyCredits) {
        Optional<ApiCreditConfig> existing = configRepository.findDefaultForRole(roleName);

        if (existing.isPresent()) {
            ApiCreditConfig config = existing.get();
            config.setMonthlyCredits(monthlyCredits);
            configRepository.save(config);
        } else {
            ApiCreditConfig newConfig =
                    ApiCreditConfig.builder()
                            .scopeType(ApiCreditConfig.ScopeType.ROLE_DEFAULT)
                            .roleName(roleName)
                            .monthlyCredits(monthlyCredits)
                            .isPooled(false)
                            .isActive(true)
                            .build();
            configRepository.save(newConfig);
        }
    }

    public void createUserCreditConfig(User user, int monthlyCredits, boolean isActive) {
        // Check if user already has a config
        Optional<ApiCreditConfig> existing = configRepository.findByUserAndIsActiveTrue(user);
        if (existing.isPresent()) {
            throw new RuntimeException("User already has a credit configuration");
        }

        ApiCreditConfig newConfig =
                ApiCreditConfig.builder()
                        .scopeType(ApiCreditConfig.ScopeType.USER)
                        .user(user)
                        .monthlyCredits(monthlyCredits)
                        .isPooled(false)
                        .isActive(isActive)
                        .build();
        configRepository.save(newConfig);
    }

    public void createOrganizationCreditConfig(Organization org, int monthlyCredits, boolean isPooled, boolean isActive) {
        // Check if organization already has a config
        Optional<ApiCreditConfig> existing = configRepository.findByOrganizationAndIsActiveTrue(org);
        if (existing.isPresent()) {
            throw new RuntimeException("Organization already has a credit configuration");
        }

        ApiCreditConfig newConfig =
                ApiCreditConfig.builder()
                        .scopeType(ApiCreditConfig.ScopeType.ORGANIZATION)
                        .organization(org)
                        .monthlyCredits(monthlyCredits)
                        .isPooled(isPooled)
                        .isActive(isActive)
                        .build();
        configRepository.save(newConfig);
    }

    private String determineScope(ApiCreditConfig config) {
        return switch (config.getScopeType()) {
            case USER ->
                    "USER:"
                            + (config.getUser() != null
                                    ? config.getUser().getUsername()
                                    : "unknown");
            case ORGANIZATION ->
                    "ORG:"
                            + (config.getOrganization() != null
                                    ? config.getOrganization().getName()
                                    : "unknown")
                            + (Boolean.TRUE.equals(config.getIsPooled())
                                    ? ":POOLED"
                                    : ":INDIVIDUAL");
            case ROLE_DEFAULT -> "ROLE:" + config.getRoleName();
        };
    }

    private String generateFingerprint(String ipAddress, String userAgent) {
        try {
            String input = ipAddress + ":" + (userAgent != null ? userAgent : "");
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes());
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            log.error("SHA-256 not available", e);
            return ipAddress; // Fallback to IP address
        }
    }

    public CreditMetrics getUserCreditMetrics(User user) {
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);
        Organization org = user.getOrganization();
        String roleName = user.getRoleName();

        Optional<ApiCreditConfig> configOpt = resolveEffectiveConfig(user, org, roleName);
        if (configOpt.isEmpty()) {
            return new CreditMetrics(
                    0, Integer.MAX_VALUE, Integer.MAX_VALUE, "UNLIMITED", currentMonth, false);
        }

        ApiCreditConfig config = configOpt.get();
        if (!config.getIsActive()) {
            return new CreditMetrics(
                    0, Integer.MAX_VALUE, Integer.MAX_VALUE, "DISABLED", currentMonth, false);
        }

        String scope = determineScope(config);
        int monthlyCredits = config.getMonthlyCredits();
        int creditsConsumed;
        boolean isPooled = false;

        switch (config.getScopeType()) {
            case USER ->
                    creditsConsumed = usageRepository.getUserCreditsConsumed(user, currentMonth);
            case ORGANIZATION -> {
                isPooled = Boolean.TRUE.equals(config.getIsPooled());
                if (isPooled && org != null) {
                    creditsConsumed = usageRepository.getOrgCreditsConsumed(org, currentMonth);
                } else {
                    creditsConsumed = usageRepository.getUserCreditsConsumed(user, currentMonth);
                }
            }
            case ROLE_DEFAULT -> {
                // Role defaults are per-user (not pooled)
                creditsConsumed = usageRepository.getUserCreditsConsumed(user, currentMonth);
            }
            default -> creditsConsumed = 0;
        }

        int remaining = Math.max(0, monthlyCredits - creditsConsumed);

        return new CreditMetrics(
                creditsConsumed, monthlyCredits, remaining, scope, currentMonth, isPooled);
    }

    // Methods for handling consecutive failure tracking
    private int incrementConsecutiveFailures(User user) {
        String userKey = getUserKey(user);
        return consecutiveFailures.compute(
                userKey, (key, value) -> (value == null) ? 1 : value + 1);
    }

    private void resetConsecutiveFailures(User user) {
        String userKey = getUserKey(user);
        consecutiveFailures.remove(userKey);
    }

    private String getUserKey(User user) {
        return "user:" + user.getId();
    }

    private String getAnonymousKey(String ipAddress, String userAgent) {
        return "anon:" + generateFingerprint(ipAddress, userAgent);
    }

    private int incrementConsecutiveFailures(String ipAddress, String userAgent) {
        String anonymousKey = getAnonymousKey(ipAddress, userAgent);
        return consecutiveFailures.compute(
                anonymousKey, (key, value) -> (value == null) ? 1 : value + 1);
    }

    private void resetConsecutiveFailures(String ipAddress, String userAgent) {
        String anonymousKey = getAnonymousKey(ipAddress, userAgent);
        consecutiveFailures.remove(anonymousKey);
    }

    // Enhanced methods for handling failure-based charging
    @Transactional
    public CreditStatus preCheckCredits(User user, int creditCost) {
        // Only check if credits are available, don't consume yet
        return checkCreditsAvailability(user, creditCost);
    }

    @Transactional
    public CreditStatus preCheckAnonymousCredits(
            String ipAddress, String userAgent, int creditCost) {
        if (!anonymousCreditSystemEnabled) {
            return new CreditStatus(
                    true,
                    0,
                    Integer.MAX_VALUE,
                    Integer.MAX_VALUE,
                    "DISABLED",
                    "Anonymous credit system disabled");
        }

        return checkAnonymousCreditsAvailability(ipAddress, userAgent, creditCost);
    }

    @Transactional
    public CreditStatus recordRequestOutcome(User user, int creditCost, FailureType outcome) {
        switch (outcome) {
            case SUCCESS -> {
                // API succeeded, consume credits and reset failure counter
                CreditStatus chargeResult = checkAndConsumeCredits(user, creditCost);
                resetConsecutiveFailures(user);
                if (chargeResult.allowed()) {
                    log.debug(
                            "User {} charged {} credits for successful API call",
                            user.getUsername(),
                            creditCost);
                } else {
                    log.warn(
                            "Failed to charge user {} {} credits on successful API call: {}",
                            user.getUsername(),
                            creditCost,
                            chargeResult.reason());
                }
                return chargeResult;
            }
            case CLIENT_ERROR -> {
                // Client error: no credit charge, no failure count increment
                log.debug("User {} not charged for client error (4xx)", user.getUsername());
                return checkCreditsAvailability(user, creditCost);
            }
            case PROCESSING_ERROR -> {
                // Processing error: no immediate charge, but count toward consecutive failures
                int consecutiveCount = incrementConsecutiveFailures(user);
                if (consecutiveCount >= 3) {
                    // Charge full credit cost after 3 consecutive processing failures
                    CreditStatus chargeResult = checkAndConsumeCredits(user, creditCost);
                    resetConsecutiveFailures(user);
                    if (chargeResult.allowed()) {
                        log.warn(
                                "User {} charged {} credits after {} consecutive processing failures",
                                user.getUsername(),
                                creditCost,
                                consecutiveCount);
                    } else {
                        log.error(
                                "Failed to charge user {} {} credits after {} consecutive failures: {}",
                                user.getUsername(),
                                creditCost,
                                consecutiveCount,
                                chargeResult.reason());
                    }
                    return chargeResult;
                } else {
                    log.debug(
                            "User {} not charged for processing failure #{}",
                            user.getUsername(),
                            consecutiveCount);
                    return checkCreditsAvailability(user, creditCost);
                }
            }
        }
        return null; // Should never reach here
    }

    @Transactional
    public void recordAnonymousRequestOutcome(
            String ipAddress, String userAgent, int creditCost, FailureType outcome) {
        switch (outcome) {
            case SUCCESS -> {
                // API succeeded, consume credits and reset failure counter
                CreditStatus chargeResult =
                        checkAndConsumeAnonymousCredits(ipAddress, userAgent, creditCost);
                resetConsecutiveFailures(ipAddress, userAgent);
                if (chargeResult.allowed()) {
                    log.debug(
                            "Anonymous user {} charged {} credits for successful API call",
                            ipAddress,
                            creditCost);
                } else {
                    log.warn(
                            "Failed to charge anonymous user {} {} credits on successful API call: {}",
                            ipAddress,
                            creditCost,
                            chargeResult.reason());
                }
            }
            case CLIENT_ERROR -> {
                // Client error: no credit charge, no failure count increment
                log.debug("Anonymous user {} not charged for client error (4xx)", ipAddress);
            }
            case PROCESSING_ERROR -> {
                // Processing error: no immediate charge, but count toward consecutive failures
                int consecutiveCount = incrementConsecutiveFailures(ipAddress, userAgent);
                if (consecutiveCount >= 3) {
                    // Charge full credit cost after 3 consecutive processing failures
                    CreditStatus chargeResult =
                            checkAndConsumeAnonymousCredits(ipAddress, userAgent, creditCost);
                    resetConsecutiveFailures(ipAddress, userAgent);
                    if (chargeResult.allowed()) {
                        log.warn(
                                "Anonymous user {} charged {} credits after {} consecutive processing failures",
                                ipAddress,
                                creditCost,
                                consecutiveCount);
                    } else {
                        log.error(
                                "Failed to charge anonymous user {} {} credits after {} consecutive failures: {}",
                                ipAddress,
                                creditCost,
                                consecutiveCount,
                                chargeResult.reason());
                    }
                } else {
                    log.debug(
                            "Anonymous user {} not charged for processing failure #{}",
                            ipAddress,
                            consecutiveCount);
                }
            }
        }
    }

    /** Determine failure type based on HTTP status code and exception type */
    public static FailureType determineFailureType(int httpStatusCode, Throwable exception) {
        // Check exception first - any exception means processing error regardless of status code
        if (exception != null) {
            String exceptionName = exception.getClass().getSimpleName().toLowerCase();

            // Client error indicators in exceptions
            if (exceptionName.contains("validation")
                    || exceptionName.contains("badrequest")
                    || exceptionName.contains("illegalargument")
                    || exceptionName.contains("missingparam")
                    || exceptionName.contains("unauthorized")
                    || exceptionName.contains("forbidden")) {
                return FailureType.CLIENT_ERROR;
            }

            // All other exceptions are processing errors
            return FailureType.PROCESSING_ERROR;
        }

        // No exception - check HTTP status code
        if (httpStatusCode >= 200 && httpStatusCode < 300) {
            return FailureType.SUCCESS;
        }

        // Client error cases (4xx) - don't count toward failures
        if (httpStatusCode >= 400 && httpStatusCode < 500) {
            return FailureType.CLIENT_ERROR;
        }

        // Server errors (5xx) - count toward consecutive failures
        if (httpStatusCode >= 500) {
            return FailureType.PROCESSING_ERROR;
        }

        // Default to processing error for unknown cases to be safe
        return FailureType.PROCESSING_ERROR;
    }

    private CreditStatus checkCreditsAvailability(User user, int creditCost) {
        // This is similar to checkAndConsumeCredits but doesn't actually consume
        if (user == null) {
            return new CreditStatus(false, 0, 0, 0, "NONE", "No user provided");
        }

        Organization org = user.getOrganization();
        String roleName = user.getRoleName();
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);

        Optional<ApiCreditConfig> configOpt = resolveEffectiveConfig(user, org, roleName);

        if (configOpt.isEmpty()) {
            return new CreditStatus(
                    true,
                    0,
                    Integer.MAX_VALUE,
                    Integer.MAX_VALUE,
                    "UNLIMITED",
                    "No credit limit configured");
        }

        ApiCreditConfig config = configOpt.get();

        if (!config.getIsActive()) {
            return new CreditStatus(
                    true,
                    0,
                    Integer.MAX_VALUE,
                    Integer.MAX_VALUE,
                    "DISABLED",
                    "Credit system disabled");
        }

        String scope = determineScope(config);
        int monthlyCredits = config.getMonthlyCredits();
        int currentCreditsConsumed;

        switch (config.getScopeType()) {
            case USER -> {
                currentCreditsConsumed = usageRepository.getUserCreditsConsumed(user, currentMonth);
            }
            case ORGANIZATION -> {
                if (org == null) {
                    return new CreditStatus(
                            false,
                            0,
                            0,
                            0,
                            scope,
                            "User has no organization but org-level limit is configured");
                }
                boolean pooled = Boolean.TRUE.equals(config.getIsPooled());
                if (pooled) {
                    currentCreditsConsumed =
                            usageRepository.getOrgCreditsConsumed(org, currentMonth);
                } else {
                    currentCreditsConsumed =
                            usageRepository.getUserCreditsConsumed(user, currentMonth);
                }
            }
            case ROLE_DEFAULT -> {
                // Role defaults are per-user (not pooled)
                currentCreditsConsumed = usageRepository.getUserCreditsConsumed(user, currentMonth);
            }
            default -> {
                return new CreditStatus(false, 0, 0, 0, scope, "Invalid configuration");
            }
        }

        int remaining = Math.max(0, monthlyCredits - currentCreditsConsumed);
        boolean hasEnoughCredits = remaining >= creditCost;

        if (!hasEnoughCredits) {
            return new CreditStatus(
                    false,
                    currentCreditsConsumed,
                    monthlyCredits,
                    remaining,
                    scope,
                    String.format(
                            "Insufficient credits. Required: %d, Available: %d",
                            creditCost, remaining));
        }

        return new CreditStatus(
                true,
                currentCreditsConsumed,
                monthlyCredits,
                remaining,
                scope,
                "Credits available");
    }

    private CreditStatus checkAnonymousCreditsAvailability(
            String ipAddress, String userAgent, int creditCost) {
        String fingerprint = generateFingerprint(ipAddress, userAgent);
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);

        // Get existing usage record
        Optional<AnonymousCreditUsage> existingUsage =
                anonymousUsageRepository.findByFingerprintAndMonth(fingerprint, currentMonth);

        AnonymousCreditUsage usage =
                existingUsage.orElse(
                        AnonymousCreditUsage.builder()
                                .fingerprint(fingerprint)
                                .month(currentMonth)
                                .creditsConsumed(0)
                                .creditsAllocated(anonymousMonthlyCredits)
                                .ipAddress(ipAddress)
                                .userAgent(userAgent)
                                .abuseScore(0)
                                .isBlocked(false)
                                .build());

        if (Boolean.TRUE.equals(usage.getIsBlocked())) {
            return new CreditStatus(
                    false,
                    usage.getCreditsConsumed(),
                    usage.getCreditsAllocated(),
                    usage.getRemainingCredits(),
                    "ANONYMOUS",
                    "IP address is blocked due to abuse");
        }

        if (!usage.hasCreditsRemaining(creditCost)) {
            return new CreditStatus(
                    false,
                    usage.getCreditsConsumed(),
                    usage.getCreditsAllocated(),
                    usage.getRemainingCredits(),
                    "ANONYMOUS",
                    String.format(
                            "Insufficient credits. Required: %d, Available: %d",
                            creditCost, usage.getRemainingCredits()));
        }

        return new CreditStatus(
                true,
                usage.getCreditsConsumed(),
                usage.getCreditsAllocated(),
                usage.getRemainingCredits(),
                "ANONYMOUS",
                "Credits available");
    }
}
