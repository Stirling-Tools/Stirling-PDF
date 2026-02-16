package stirling.software.proprietary.security.service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.constants.JwtConstants;
import stirling.software.common.model.ApplicationProperties;

/**
 * Service to rate limit token refresh attempts within the grace period.
 *
 * <p>Prevents abuse of expired tokens by tracking and limiting refresh attempts per token. Tokens
 * are identified by a hash to avoid storing actual token values.
 */
@Service
@Slf4j
public class RefreshRateLimitService {

    private final ApplicationProperties.Security.Jwt jwtProperties;

    @Autowired
    public RefreshRateLimitService(ApplicationProperties applicationProperties) {
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
    }

    private static class RefreshAttempt {
        private final AtomicInteger count = new AtomicInteger(0);
        private final Instant firstAttempt = Instant.now();

        int incrementAndGet() {
            return count.incrementAndGet();
        }

        Instant getFirstAttempt() {
            return firstAttempt;
        }

        int getCount() {
            return count.get();
        }
    }

    private final Map<String, RefreshAttempt> attempts = new ConcurrentHashMap<>();

    /**
     * Check if a refresh attempt is allowed for the given token.
     *
     * @param tokenHash hash of the token attempting refresh
     * @param graceWindowMillis the configured grace window in milliseconds
     * @return true if refresh is allowed, false if rate limit exceeded
     */
    public boolean isRefreshAllowed(String tokenHash, long graceWindowMillis) {
        RefreshAttempt attempt = attempts.computeIfAbsent(tokenHash, k -> new RefreshAttempt());

        int attemptCount = attempt.incrementAndGet();

        if (attemptCount > JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE) {
            log.warn(
                    "Refresh rate limit exceeded for token (attempt {}). Token hash: {}",
                    attemptCount,
                    tokenHash.substring(0, Math.min(8, tokenHash.length())));
            return false;
        }

        // Clean up if outside grace window
        Instant cutoff = Instant.now().minusMillis(graceWindowMillis);
        if (attempt.getFirstAttempt().isBefore(cutoff)) {
            attempts.remove(tokenHash);
        }

        return true;
    }

    /**
     * Remove tracking for a token after successful refresh.
     *
     * @param tokenHash hash of the refreshed token
     */
    public void clearRefreshAttempts(String tokenHash) {
        attempts.remove(tokenHash);
    }

    /** Clean up expired tracking entries every 5 minutes. */
    @Scheduled(fixedRate = 300000)
    public void cleanupExpiredEntries() {
        // Use configured grace period with same normalization as runtime checks
        int configuredMinutes = jwtProperties.getRefreshGraceMinutes();
        int graceMinutes =
                configuredMinutes >= 0
                        ? configuredMinutes
                        : JwtConstants.DEFAULT_REFRESH_GRACE_MINUTES;
        Instant cutoff = Instant.now().minusMillis(graceMinutes * 60000L);
        int removed =
                attempts.entrySet().stream()
                        .filter(entry -> entry.getValue().getFirstAttempt().isBefore(cutoff))
                        .mapToInt(
                                entry -> {
                                    attempts.remove(entry.getKey());
                                    return 1;
                                })
                        .sum();

        if (removed > 0) {
            log.debug("Cleaned up {} expired refresh tracking entries", removed);
        }
    }

    /** Get current tracking statistics for monitoring. */
    public Map<String, Object> getStats() {
        return Map.of(
                "tracked_tokens",
                attempts.size(),
                "max_attempts_allowed",
                JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE);
    }
}
