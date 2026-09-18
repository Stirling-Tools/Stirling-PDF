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
import io.lettuce.core.api.StatefulConnection;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.cluster.RedisClusterClient;
import io.lettuce.core.cluster.api.StatefulRedisClusterConnection;
import io.lettuce.core.codec.ByteArrayCodec;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import stirling.software.common.cluster.RateLimitStore;

/**
 * Bucket4j CAS scripts are {@code KEYS[1]}-only, so each bucket stays linearizable on one slot with
 * no hash tag needed - correct on standalone, sentinel and cluster.
 */
@Component
@ConditionalOnValkeyBackplane
public class ValkeyRateLimitStore implements RateLimitStore {

    private static final String PREFIX = "stirling:rl:";

    private final LettuceConnectionFactory connectionFactory;
    private StatefulConnection<byte[], byte[]> connection;
    private ProxyManager<byte[]> proxyManager;

    public ValkeyRateLimitStore(LettuceConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    @PostConstruct
    void initProxyManager() {
        AbstractRedisClient client = connectionFactory.getNativeClient();
        // Own the connection (rather than the client overloads) so it is closed at shutdown; it
        // inherits the RedisURI client name, so CLIENT LIST still attributes it to this node.
        Bucket4jLettuce.LettuceBasedProxyManagerBuilder<byte[]> builder;
        if (client instanceof RedisClusterClient clusterClient) {
            StatefulRedisClusterConnection<byte[], byte[]> conn =
                    clusterClient.connect(ByteArrayCodec.INSTANCE);
            this.connection = conn;
            builder = Bucket4jLettuce.casBasedBuilder(conn);
        } else if (client instanceof RedisClient redisClient) {
            // Sentinel also yields a plain RedisClient, so this arm covers standalone + sentinel.
            StatefulRedisConnection<byte[], byte[]> conn =
                    redisClient.connect(ByteArrayCodec.INSTANCE);
            this.connection = conn;
            builder = Bucket4jLettuce.casBasedBuilder(conn);
        } else {
            throw new IllegalStateException(
                    "ValkeyRateLimitStore needs a Lettuce RedisClient or RedisClusterClient; got "
                            + (client == null ? "null" : client.getClass().getName())
                            + ". This is a Stirling bug - please report it.");
        }
        // One key per user/API-key/IP, so idle buckets must expire. 25h cap covers the longest
        // (daily) rate-limit window.
        this.proxyManager =
                builder.expirationAfterWrite(
                                ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(
                                        Duration.ofHours(25)))
                        .build();
    }

    @PreDestroy
    void shutdown() {
        proxyManager = null;
        if (connection != null) {
            connection.close();
            connection = null;
        }
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
