package stirling.software.common.cluster;

import java.time.Duration;

/** Token-bucket rate limiting backed by the cluster backplane. */
public interface RateLimitStore {

    /**
     * Attempt to consume one token from the bucket identified by {@code bucketKey}.
     *
     * @param bucketKey opaque key identifying the bucket (e.g. {@code api:user:123})
     * @param capacity bucket capacity
     * @param refillPeriod time window over which {@code capacity} tokens refill
     */
    RateLimitDecision tryConsume(String bucketKey, long capacity, Duration refillPeriod);

    record RateLimitDecision(boolean allowed, long remainingTokens, long nanosToWaitForRefill) {}
}
