package stirling.software.common.cluster;

import java.time.Duration;

/**
 * Token-bucket rate limiting backed by the cluster backplane.
 *
 * <p>In-process implementations enforce a per-JVM limit; distributed implementations enforce a
 * single global limit across every node. Both use a Bucket4j greedy-refill token bucket so the
 * semantics match across single-node and cluster deployments.
 */
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
