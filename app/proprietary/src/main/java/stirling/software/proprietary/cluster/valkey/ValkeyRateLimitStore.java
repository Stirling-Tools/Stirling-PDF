package stirling.software.proprietary.cluster.valkey;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

import io.github.bucket4j.BucketConfiguration;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.distributed.BucketProxy;
import io.github.bucket4j.distributed.ExpirationAfterWriteStrategy;
import io.github.bucket4j.distributed.proxy.ProxyManager;
import io.github.bucket4j.redis.lettuce.Bucket4jLettuce;
import io.lettuce.core.AbstractRedisClient;
import io.lettuce.core.RedisClient;
import io.quarkus.arc.properties.IfBuildProperty;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import stirling.software.common.cluster.RateLimitStore;

/**
 * Valkey-backed token-bucket rate limiting via Bucket4j's Lettuce ProxyManager. The token bucket
 * refills continuously and enforces one global limit across nodes, with the same semantics as the
 * in-process {@code InProcessRateLimitStore} (which also uses Bucket4j).
 */
// Build-time gating: included in the build only when cluster.backplane=valkey; otherwise this bean
// (and its RedisClient dependency) is removed so no eager Redis startup observer is generated and
// the in-process @DefaultBean RateLimitStore wins. @ConditionalOnValkeyBackplane is documentary
// only.
@ApplicationScoped
@ConditionalOnValkeyBackplane
@IfBuildProperty(name = "cluster.backplane", stringValue = "valkey")
public class ValkeyRateLimitStore implements RateLimitStore {

    private static final String PREFIX = "stirling:rl:";

    // TODO: Migration required - this previously received a spring-data-redis
    // LettuceConnectionFactory (produced by the not-yet-migrated ValkeyConnectionConfiguration)
    // and unwrapped its native io.lettuce.core.RedisClient. Bucket4j's Lettuce ProxyManager only
    // needs that raw RedisClient. Once ValkeyConnectionConfiguration is migrated to a Quarkus
    // producer (exposing a RedisClient or io.quarkus.redis.datasource.RedisDataSource), inject it
    // here directly and drop the AbstractRedisClient unwrap below. The RedisClient is injected as a
    // CDI bean for now so the Bucket4j logic stays intact and the file compiles.
    private final AbstractRedisClient nativeRedisClient;
    private ProxyManager<byte[]> proxyManager;

    @Inject
    public ValkeyRateLimitStore(AbstractRedisClient nativeRedisClient) {
        this.nativeRedisClient = nativeRedisClient;
    }

    @PostConstruct
    void initProxyManager() {
        AbstractRedisClient client = nativeRedisClient;
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
