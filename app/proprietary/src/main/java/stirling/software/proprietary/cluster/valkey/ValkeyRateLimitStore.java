package stirling.software.proprietary.cluster.valkey;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.stereotype.Component;

import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.BucketProxy;
import io.github.bucket4j.distributed.ExpirationAfterWriteStrategy;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.Bucket4jLettuce;
import io.lettuce.core.AbstractRedisClient;
import io.lettuce.core.RedisClient;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import stirling.software.common.cluster.RateLimitStore;

/**
 * Valkey-backed token-bucket rate limiting via Bucket4j's Lettuce ProxyManager. The token bucket
 * refills continuously and enforces one global limit across nodes, with the same semantics as the
 * in-process {@code InProcessRateLimitStore} (which also uses Bucket4j).
 */
@Component
@ConditionalOnValkeyBackplane
public class ValkeyRateLimitStore implements RateLimitStore {

    private static final String PREFIX = "stirling:rl:";

    private final LettuceConnectionFactory connectionFactory;
    private ProxyManager<byte[]> proxyManager;

    public ValkeyRateLimitStore(LettuceConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    @PostConstruct
    void initProxyManager() {
        AbstractRedisClient client = connectionFactory.getNativeClient();
        if (!(client instanceof RedisClient redisClient)) {
            throw new IllegalStateException(
                    "ValkeyRateLimitStore requires a standalone Lettuce RedisClient; got "
                            + (client == null ? "null" : client.getClass().getName())
                            + " (cluster client not supported by this rate limit impl)");
        }
        // Expire idle bucket keys so they do not accumulate forever in Valkey (one key per
        // user / API-key / IP). TTL tracks the time to refill the bucket from empty, capped at
        // 25h to cover the longest (daily) rate-limit window; an idle bucket evicts after that.
        this.proxyManager =
                Bucket4jLettuce.casBasedBuilder(redisClient)
                        .expirationAfterWrite(
                                ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(
                                        Duration.ofHours(25)))
                        .build();
    }

    @PreDestroy
    void shutdown() {
        proxyManager = null;
    }

    @Override
    public RateLimitDecision tryConsume(String bucketKey, long capacity, Duration refillPeriod) {
        byte[] key = (PREFIX + bucketKey).getBytes(StandardCharsets.UTF_8);
        BucketConfiguration cfg =
                BucketConfiguration.builder()
                        .addLimit(
                                stage ->
                                        stage.capacity(capacity)
                                                .refillGreedy(capacity, refillPeriod))
                        .build();
        BucketProxy bucket = proxyManager.builder().build(key, () -> cfg);
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            return new RateLimitDecision(true, probe.getRemainingTokens(), 0L);
        }
        return new RateLimitDecision(false, 0L, probe.getNanosToWaitForRefill());
    }
}
