package stirling.software.saas.service;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Simple in-memory rate limiting service. Tracks attempts per key (e.g., user ID or team ID) and
 * enforces limits.
 */
@Service
@Profile("saas")
@Slf4j
public class RateLimitService {

    // Rate limit configurations
    private static final int INVITATION_LIMIT_PER_HOUR = 50;
    private static final int INVITATION_LIMIT_PER_DAY = 150;

    // In-memory storage: key -> (count, resetTime)
    private final ConcurrentHashMap<String, RateLimitBucket> hourlyLimits =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, RateLimitBucket> dailyLimits =
            new ConcurrentHashMap<>();

    /**
     * Check if an invitation attempt is allowed for a team.
     *
     * @param teamId the team ID
     * @return true if allowed, false if rate limit exceeded
     */
    public boolean allowInvitation(Long teamId) {
        String key = "team:" + teamId;

        // Check hourly limit
        if (!checkAndIncrement(hourlyLimits, key, INVITATION_LIMIT_PER_HOUR, Duration.ofHours(1))) {
            log.warn("Team {} exceeded hourly invitation limit", teamId);
            return false;
        }

        // Check daily limit
        if (!checkAndIncrement(dailyLimits, key, INVITATION_LIMIT_PER_DAY, Duration.ofDays(1))) {
            log.warn("Team {} exceeded daily invitation limit", teamId);
            // Decrement hourly counter since we're rejecting
            decrementCounter(hourlyLimits, key);
            return false;
        }

        log.debug("Team {} invitation allowed", teamId);
        return true;
    }

    /**
     * Get remaining invitation quota for a team.
     *
     * @param teamId the team ID
     * @return remaining invitations allowed this hour
     */
    public int getRemainingInvitations(Long teamId) {
        String key = "team:" + teamId;
        RateLimitBucket bucket = hourlyLimits.get(key);

        if (bucket == null || bucket.isExpired()) {
            return INVITATION_LIMIT_PER_HOUR;
        }

        return Math.max(0, INVITATION_LIMIT_PER_HOUR - bucket.getCount());
    }

    /** Check rate limit and increment counter if allowed. */
    private boolean checkAndIncrement(
            ConcurrentHashMap<String, RateLimitBucket> storage,
            String key,
            int limit,
            Duration window) {

        long now = System.currentTimeMillis();
        long resetTime = now + window.toMillis();

        RateLimitBucket bucket =
                storage.compute(
                        key,
                        (k, existing) -> {
                            if (existing == null || existing.isExpired()) {
                                return new RateLimitBucket(1, resetTime);
                            } else {
                                existing.increment();
                                return existing;
                            }
                        });

        return bucket.getCount() <= limit;
    }

    /** Decrement counter (for rollback scenarios). */
    private void decrementCounter(ConcurrentHashMap<String, RateLimitBucket> storage, String key) {
        storage.computeIfPresent(
                key,
                (k, bucket) -> {
                    bucket.decrement();
                    return bucket;
                });
    }

    /** Cleanup expired buckets every hour. */
    @Scheduled(fixedRate = 3600000) // 1 hour
    public void cleanupExpiredBuckets() {
        long now = System.currentTimeMillis();

        int hourlyRemoved =
                (int)
                        hourlyLimits.entrySet().stream()
                                .filter(e -> e.getValue().getResetTime() < now)
                                .peek(e -> hourlyLimits.remove(e.getKey()))
                                .count();

        int dailyRemoved =
                (int)
                        dailyLimits.entrySet().stream()
                                .filter(e -> e.getValue().getResetTime() < now)
                                .peek(e -> dailyLimits.remove(e.getKey()))
                                .count();

        if (hourlyRemoved + dailyRemoved > 0) {
            log.debug(
                    "Cleaned up {} expired rate limit buckets (hourly: {}, daily: {})",
                    hourlyRemoved + dailyRemoved,
                    hourlyRemoved,
                    dailyRemoved);
        }
    }

    /** Internal class to track rate limit counts and reset times. */
    private static class RateLimitBucket {
        private final AtomicInteger count;
        private final long resetTime;

        public RateLimitBucket(int initialCount, long resetTime) {
            this.count = new AtomicInteger(initialCount);
            this.resetTime = resetTime;
        }

        public int getCount() {
            return count.get();
        }

        public void increment() {
            count.incrementAndGet();
        }

        public void decrement() {
            count.decrementAndGet();
        }

        public long getResetTime() {
            return resetTime;
        }

        public boolean isExpired() {
            return System.currentTimeMillis() > resetTime;
        }
    }
}
