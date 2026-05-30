package stirling.software.common.cluster.inprocess;

import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.local.LocalBucketBuilder;

import stirling.software.common.cluster.RateLimitStore;

/** Bucket4j-backed token bucket implementation of {@link RateLimitStore}. */
public class InProcessRateLimitStore implements RateLimitStore {

    /** Cap to bound memory; oldest accessed buckets are evicted. */
    private static final int MAX_BUCKETS = 10_000;

    private final Map<String, Bucket> buckets =
            Collections.synchronizedMap(
                    new LinkedHashMap<String, Bucket>(256, 0.75f, true) {
                        @Override
                        protected boolean removeEldestEntry(Map.Entry<String, Bucket> eldest) {
                            return size() > MAX_BUCKETS;
                        }
                    });

    @Override
    public RateLimitDecision tryConsume(String bucketKey, long capacity, Duration refillPeriod) {
        String compositeKey = bucketKey + "|" + capacity + "|" + refillPeriod.toNanos();
        Bucket bucket =
                buckets.computeIfAbsent(compositeKey, k -> buildBucket(capacity, refillPeriod));
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        return new RateLimitDecision(
                probe.isConsumed(),
                probe.getRemainingTokens(),
                probe.isConsumed() ? 0L : probe.getNanosToWaitForRefill());
    }

    private static Bucket buildBucket(long capacity, Duration refillPeriod) {
        Bandwidth limit =
                Bandwidth.builder().capacity(capacity).refillGreedy(capacity, refillPeriod).build();
        LocalBucketBuilder builder = Bucket.builder();
        builder.addLimit(limit);
        return builder.build();
    }
}
