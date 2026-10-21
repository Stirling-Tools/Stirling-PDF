package stirling.software.common.cluster.inprocess;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import stirling.software.common.cluster.RateLimitStore;

/** In-process greedy-refill token bucket, sized for a single local backend. */
public class InProcessRateLimitStore implements RateLimitStore {

    /** Cap to bound memory; oldest accessed buckets are evicted. */
    private static final int MAX_BUCKETS = 10_000;

    private final Map<String, BucketState> buckets =
            new LinkedHashMap<>(256, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, BucketState> eldest) {
                    return size() > MAX_BUCKETS;
                }
            };

    @Override
    public synchronized RateLimitDecision tryConsume(
            String bucketKey, long capacity, Duration refillPeriod) {
        if (capacity <= 0 || refillPeriod.isZero() || refillPeriod.isNegative()) {
            throw new IllegalArgumentException("capacity and refillPeriod must be positive");
        }
        String compositeKey = bucketKey + "|" + capacity + "|" + refillPeriod.toNanos();
        BucketState bucket =
                buckets.computeIfAbsent(compositeKey, key -> new BucketState(capacity));
        bucket.refill(capacity, refillPeriod.toNanos());

        if (bucket.tokens >= 1d) {
            bucket.tokens -= 1d;
            return new RateLimitDecision(true, (long) Math.floor(bucket.tokens), 0L);
        }
        double missingTokens = 1d - bucket.tokens;
        long waitNanos =
                (long) Math.ceil(missingTokens * refillPeriod.toNanos() / (double) capacity);
        return new RateLimitDecision(false, 0L, waitNanos);
    }

    private static final class BucketState {
        private double tokens;
        private long lastRefillNanos;

        private BucketState(long capacity) {
            this.tokens = capacity;
            this.lastRefillNanos = System.nanoTime();
        }

        private void refill(long capacity, long refillPeriodNanos) {
            long now = System.nanoTime();
            long elapsed = now - lastRefillNanos;
            if (elapsed <= 0) {
                return;
            }
            double replenished = (double) elapsed * capacity / (double) refillPeriodNanos;
            tokens = Math.min(capacity, tokens + replenished);
            lastRefillNanos = now;
        }
    }
}
