package stirling.software.proprietary.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.AnonymousApiUsage;
import stirling.software.proprietary.model.ApiRateLimitConfig;
import stirling.software.proprietary.model.ApiRateLimitUsage;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.repository.AnonymousApiUsageRepository;
import stirling.software.proprietary.repository.ApiRateLimitConfigRepository;
import stirling.software.proprietary.repository.ApiRateLimitUsageRepository;
import stirling.software.proprietary.security.model.User;

@Service
@RequiredArgsConstructor
@Slf4j
public class ApiRateLimitService {

    private final ApiRateLimitConfigRepository configRepository;
    private final ApiRateLimitUsageRepository usageRepository;
    private final AnonymousApiUsageRepository anonymousUsageRepository;
    
    @Value("${api.rate-limit.anonymous.enabled:true}")
    private boolean anonymousRateLimitEnabled;
    
    @Value("${api.rate-limit.anonymous.monthly-limit:10}")
    private int anonymousMonthlyLimit;
    
    @Value("${api.rate-limit.anonymous.abuse-threshold:3}")
    private int abuseThreshold;

    public record RateLimitStatus(
        boolean allowed,
        int currentUsage,
        int monthlyLimit,
        int remaining,
        String scope,
        String reason
    ) {}

    public record UsageMetrics(
        int currentUsage,
        int monthlyLimit,
        int remaining,
        String scope,
        YearMonth month,
        boolean isPooled
    ) {}

    // TODO: improve with Redis and async in future V2.1
    @Transactional
    public RateLimitStatus checkAndIncrementUsage(User user) {
        if (user == null) {
            return new RateLimitStatus(false, 0, 0, 0, "NONE", "No user provided");
        }

        Organization org = user.getOrganization();
        String roleName = user.getUserRole().getRoleId();
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);
        String monthKey = currentMonth.toString();

        Optional<ApiRateLimitConfig> configOpt = resolveEffectiveConfig(user, org, roleName);
        
        if (configOpt.isEmpty()) {
            log.warn("No rate limit config found for user: {}, org: {}, role: {}", 
                     user.getUsername(), org != null ? org.getName() : "null", roleName);
            return new RateLimitStatus(true, 0, Integer.MAX_VALUE, Integer.MAX_VALUE, 
                                      "UNLIMITED", "No rate limit configured");
        }

        ApiRateLimitConfig config = configOpt.get();
        
        if (!config.getIsActive()) {
            return new RateLimitStatus(true, 0, Integer.MAX_VALUE, Integer.MAX_VALUE, 
                                      "DISABLED", "Rate limiting disabled");
        }

        String scope = determineScope(config);
        int monthlyLimit = config.getMonthlyLimit();
        
        boolean success;
        int currentUsage;
        
        switch (config.getScopeType()) {
            case USER -> {
                success = usageRepository.upsertAndIncrementUserUsage(
                    user, monthKey, 1, monthlyLimit) > 0;
                currentUsage = usageRepository.getUserUsageOrZero(user, currentMonth);
            }
            case ORGANIZATION -> {
                if (org == null) {
                    return new RateLimitStatus(false, 0, 0, 0, scope, 
                                             "User has no organization but org-level limit is configured");
                }
                boolean pooled = Boolean.TRUE.equals(config.getIsPooled());
                if (pooled) {
                    success = usageRepository.upsertAndIncrementOrgUsage(
                        org, monthKey, 1, monthlyLimit) > 0;
                    currentUsage = usageRepository.getOrgUsageOrZero(org, currentMonth);
                    scope = "ORG:" + org.getName() + " (pooled)";
                } else {
                    // per-user limit defined by org policy
                    success = usageRepository.upsertAndIncrementUserUsage(
                        user, monthKey, 1, monthlyLimit) > 0;
                    currentUsage = usageRepository.getUserUsageOrZero(user, currentMonth);
                    scope = "ORG:" + org.getName() + " (per-user)";
                }
            }
            case ROLE_DEFAULT -> {
                success = usageRepository.upsertAndIncrementUserUsage(
                    user, monthKey, 1, monthlyLimit) > 0;
                currentUsage = usageRepository.getUserUsageOrZero(user, currentMonth);
            }
            default -> {
                log.error("Unknown scope type: {}", config.getScopeType());
                return new RateLimitStatus(false, 0, 0, 0, scope, "Invalid configuration");
            }
        }

        int remaining = Math.max(0, monthlyLimit - currentUsage);
        
        if (!success) {
            return new RateLimitStatus(false, currentUsage, monthlyLimit, 0, scope, 
                                      "Monthly limit exceeded");
        }
        
        return new RateLimitStatus(true, currentUsage, monthlyLimit, remaining, scope, "OK");
    }

    @Transactional(readOnly = true)
    public UsageMetrics getUsageMetrics(User user) {
        if (user == null) {
            return new UsageMetrics(0, Integer.MAX_VALUE, Integer.MAX_VALUE, 
                                   "NONE", YearMonth.now(ZoneOffset.UTC), false);
        }

        Organization org = user.getOrganization();
        String roleName = user.getUserRole().getRoleId();
        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);

        Optional<ApiRateLimitConfig> configOpt = resolveEffectiveConfig(user, org, roleName);
        
        if (configOpt.isEmpty() || !configOpt.get().getIsActive()) {
            return new UsageMetrics(0, Integer.MAX_VALUE, Integer.MAX_VALUE, 
                                   "UNLIMITED", currentMonth, false);
        }

        ApiRateLimitConfig config = configOpt.get();
        String scope = determineScope(config);
        int monthlyLimit = config.getMonthlyLimit();
        boolean isPooled = Boolean.TRUE.equals(config.getIsPooled());
        
        int currentUsage = switch (config.getScopeType()) {
            case USER, ROLE_DEFAULT -> usageRepository.getUserUsageOrZero(user, currentMonth);
            case ORGANIZATION -> {
                if (org != null && isPooled) {
                    yield usageRepository.getOrgUsageOrZero(org, currentMonth);
                } else if (org != null) {
                    yield usageRepository.getUserUsageOrZero(user, currentMonth);
                } else {
                    yield 0;
                }
            }
        };
        
        int remaining = Math.max(0, monthlyLimit - currentUsage);
        
        return new UsageMetrics(currentUsage, monthlyLimit, remaining, scope, currentMonth, isPooled);
    }

    @Transactional
    public ApiRateLimitConfig createOrUpdateUserLimit(User user, int monthlyLimit) {
        ApiRateLimitConfig config = configRepository.findByUserAndIsActiveTrue(user)
            .orElse(ApiRateLimitConfig.builder()
                .scopeType(ApiRateLimitConfig.ScopeType.USER)
                .user(user)
                .build());
        
        config.setMonthlyLimit(monthlyLimit);
        config.setIsActive(true);
        config.setIsPooled(false);
        
        return configRepository.save(config);
    }

    @Transactional
    public ApiRateLimitConfig createOrUpdateOrgLimit(Organization org, int monthlyLimit, boolean isPooled) {
        ApiRateLimitConfig config = configRepository.findByOrganizationAndIsActiveTrue(org)
            .orElse(ApiRateLimitConfig.builder()
                .scopeType(ApiRateLimitConfig.ScopeType.ORGANIZATION)
                .organization(org)
                .build());
        
        config.setMonthlyLimit(monthlyLimit);
        config.setIsActive(true);
        config.setIsPooled(isPooled);
        
        return configRepository.save(config);
    }

    @Transactional
    public ApiRateLimitConfig createOrUpdateRoleDefault(String roleName, int monthlyLimit) {
        ApiRateLimitConfig config = configRepository.findDefaultForRole(roleName)
            .orElse(ApiRateLimitConfig.builder()
                .scopeType(ApiRateLimitConfig.ScopeType.ROLE_DEFAULT)
                .roleName(roleName)
                .build());
        
        config.setMonthlyLimit(monthlyLimit);
        config.setIsActive(true);
        config.setIsPooled(false);
        
        return configRepository.save(config);
    }

    private String determineScope(ApiRateLimitConfig config) {
        return switch (config.getScopeType()) {
            case USER -> "USER:" + config.getUser().getUsername();
            case ORGANIZATION -> "ORG:" + config.getOrganization().getName() + 
                               (Boolean.TRUE.equals(config.getIsPooled()) ? " (pooled)" : "");
            case ROLE_DEFAULT -> "ROLE:" + config.getRoleName();
        };
    }

    @Transactional
    public RateLimitStatus checkAndIncrementAnonymousUsage(String ipAddress, String userAgent) {
        if (!anonymousRateLimitEnabled) {
            return new RateLimitStatus(true, 0, Integer.MAX_VALUE, Integer.MAX_VALUE, 
                                      "ANONYMOUS_DISABLED", "Anonymous rate limiting disabled");
        }

        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);
        String fingerprint = generateFingerprint(ipAddress, userAgent);
        
        // Check for abuse patterns
        if (detectAbuse(fingerprint, ipAddress, currentMonth)) {
            log.warn("Abuse detected for anonymous user - IP: {}, Fingerprint: {}", ipAddress, fingerprint);
            return new RateLimitStatus(false, 0, 0, 0, "ANONYMOUS_BLOCKED", 
                                      "Access blocked due to suspicious activity");
        }
        
        // Atomic upsert and increment operation that returns the new count
        Integer newCount = anonymousUsageRepository.upsertAndIncrementReturningCount(
            fingerprint, currentMonth.toString(), ipAddress, userAgent, anonymousMonthlyLimit);
        
        if (newCount == null) {
            // Limit exceeded (WHERE clause prevented update)
            return new RateLimitStatus(false, anonymousMonthlyLimit, anonymousMonthlyLimit, 0,
                                      "ANONYMOUS", "Monthly limit exceeded for anonymous access");
        }
        
        int remaining = Math.max(0, anonymousMonthlyLimit - newCount);
        return new RateLimitStatus(true, newCount, anonymousMonthlyLimit, remaining, 
                                  "ANONYMOUS", "OK");
    }

    private boolean detectAbuse(String fingerprint, String ipAddress, YearMonth month) {
        // Check if fingerprint is already blocked
        Optional<AnonymousApiUsage> blockedUsage = anonymousUsageRepository
            .findByFingerprintAndMonth(fingerprint, month);
        if (blockedUsage.isPresent() && Boolean.TRUE.equals(blockedUsage.get().getIsBlocked())) {
            return true;
        }
        
        // Check for multiple fingerprints from same IP (credential changing)
        Long distinctFingerprints = anonymousUsageRepository
            .countDistinctFingerprintsForIp(ipAddress, month);
        
        if (distinctFingerprints > abuseThreshold) {
            // Block all fingerprints associated with this IP
            List<AnonymousApiUsage> ipUsages = anonymousUsageRepository
                .findByIpAddressAndMonth(ipAddress, month);
            for (AnonymousApiUsage ipUsage : ipUsages) {
                ipUsage.setIsBlocked(true);
                ipUsage.setAbuseScore(ipUsage.getAbuseScore() + 10);
                // Link fingerprints as related
                ipUsage.getRelatedFingerprints().add(fingerprint);
            }
            anonymousUsageRepository.saveAll(ipUsages);
            return true;
        }
        
        // Check total usage across all fingerprints for this IP
        Integer totalIpUsage = anonymousUsageRepository
            .getTotalUsageByIpAndMonth(ipAddress, month);
        if (totalIpUsage > anonymousMonthlyLimit * 2) {
            // Excessive usage from single IP
            return true;
        }
        
        return false;
    }

    private String generateFingerprint(String ipAddress, String userAgent) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            String data = ipAddress + "|" + (userAgent != null ? userAgent : "unknown");
            byte[] hash = md.digest(data.getBytes());
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            log.error("Failed to generate fingerprint", e);
            return ipAddress; // Fallback to IP
        }
    }

    public int getAnonymousMonthlyLimit() {
        return anonymousMonthlyLimit;
    }

    public UsageMetrics getAnonymousUsageMetrics(String ipAddress, String userAgent) {
        if (!anonymousRateLimitEnabled) {
            return new UsageMetrics(0, Integer.MAX_VALUE, Integer.MAX_VALUE, 
                                   "ANONYMOUS_DISABLED", YearMonth.now(ZoneOffset.UTC), false);
        }

        YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);
        String fingerprint = generateFingerprint(ipAddress, userAgent);
        
        Optional<AnonymousApiUsage> usageOpt = anonymousUsageRepository
            .findByFingerprintAndMonth(fingerprint, currentMonth);
        
        if (usageOpt.isEmpty()) {
            return new UsageMetrics(0, anonymousMonthlyLimit, anonymousMonthlyLimit, 
                                   "ANONYMOUS", currentMonth, false);
        }
        
        AnonymousApiUsage usage = usageOpt.get();
        int remaining = Math.max(0, anonymousMonthlyLimit - usage.getUsageCount());
        
        return new UsageMetrics(usage.getUsageCount(), anonymousMonthlyLimit, remaining, 
                               "ANONYMOUS", currentMonth, false);
    }

    private Optional<ApiRateLimitConfig> resolveEffectiveConfig(User user, Organization org, String roleName) {
        // Priority: User > Organization > Role
        Optional<ApiRateLimitConfig> userConfig = configRepository.findByUserAndIsActiveTrue(user);
        if (userConfig.isPresent()) {
            return userConfig;
        }

        if (org != null) {
            Optional<ApiRateLimitConfig> orgConfig = configRepository.findByOrganizationAndIsActiveTrue(org);
            if (orgConfig.isPresent()) {
                return orgConfig;
            }
        }

        return configRepository.findByScopeTypeAndRoleNameAndIsActiveTrue(
            ApiRateLimitConfig.ScopeType.ROLE_DEFAULT, roleName);
    }
}