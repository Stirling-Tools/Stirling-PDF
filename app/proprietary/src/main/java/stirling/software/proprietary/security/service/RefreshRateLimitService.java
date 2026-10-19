package stirling.software.proprietary.security.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.constants.JwtConstants;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.scheduling.LazyScheduledTask;

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
    private final LazyScheduledTask cleanupSweep;

    @Autowired
    public RefreshRateLimitService(
            ApplicationProperties applicationProperties, TaskScheduler scheduler) {
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
        this.cleanupSweep = new LazyScheduledTask(scheduler, this::cleanupExpiredEntries);
    }

    private record RefreshAttempt(AtomicInteger count, Instant firstAttempt) {
        RefreshAttempt() {
            this(new AtomicInteger(0), Instant.now());
        }

        int incrementAndGet() {
            return count.incrementAndGet();
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
        cleanupSweep.ensureFixedRate(Duration.ofMinutes(5));

        if (attemptCount > JwtConstants.MAX_REFRESH_ATTEMPTS_IN_GRACE) {
            log.warn(
                    "Refresh rate limit exceeded for token (attempt {}). Token hash: {}",
                    attemptCount,
                    tokenHash.substring(0, Math.min(8, tokenHash.length())));
            return false;
        }

        // Clean up if outside grace window
        Instant cutoff = Instant.now().minusMillis(graceWindowMillis);
        if (attempt.firstAttempt().isBefore(cutoff)) {
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

    /** Cleans up expired tracking entries; armed by the first refresh attempt. */
    public void cleanupExpiredEntries() {
        // Use configured grace period with same normalization as runtime checks
        int configuredMinutes = jwtProperties.getRefreshGraceMinutes();
        int graceMinutes =
                configuredMinutes >= 0
                        ? configuredMinutes
                        : JwtConstants.DEFAULT_REFRESH_GRACE_MINUTES;
        Instant cutoff = Instant.now().minusMillis(graceMinutes * 60000L);
        int beforeSize = attempts.size();
        attempts.entrySet().removeIf(entry -> entry.getValue().firstAttempt().isBefore(cutoff));
        int removed = beforeSize - attempts.size();

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
