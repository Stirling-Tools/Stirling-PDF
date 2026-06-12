package stirling.software.proprietary.cluster.valkey;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import io.quarkus.arc.lookup.LookupIfProperty;
import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.value.SetArgs;
import io.quarkus.redis.datasource.value.ValueCommands;
import io.vertx.mutiny.redis.client.Response;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.DistributedLock;

// DI mapping applied here:
//   @Component                  -> @ApplicationScoped
//   @RequiredArgsConstructor    -> explicit @Inject constructor (single injected collaborator)
//   @ConditionalOnValkeyBackplane -> the two stacked @LookupIfProperty guards below (per the note
// in
//                                    ConditionalOnValkeyBackplane: Quarkus does not transitively
//                                    propagate @LookupIfProperty through the meta-annotation, so
// the
//                                    guards are repeated directly on this consumer).
//
// Migrated off spring-data-redis (StringRedisTemplate / RedisScript / DefaultRedisScript) onto
// io.quarkus.redis.datasource.RedisDataSource:
//   - tryAcquire -> SET key value NX PX <leaseMillis> via ValueCommands.setAndChanged(..., SetArgs)
//   - release/renew -> EVAL of the Lua scripts via RedisDataSource.execute("EVAL", ...).
// The injected bean is now the RedisDataSource that ValkeyConnectionConfiguration produces; the Lua
// scripts and the acquire/release/renew control flow are framework-agnostic and carry over
// unchanged.
@ApplicationScoped
@LookupIfProperty(name = "cluster.enabled", stringValue = "true")
@LookupIfProperty(name = "cluster.backplane", stringValue = "valkey")
@Slf4j
public class ValkeyDistributedLock implements DistributedLock {

    private static final String PREFIX = "stirling:lock:";

    private static final String RELEASE_SCRIPT =
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

    private static final String RENEW_SCRIPT =
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end";

    private final RedisDataSource redis;
    private final ValueCommands<String, String> values;

    @Inject
    public ValkeyDistributedLock(RedisDataSource redis) {
        this.redis = redis;
        this.values = redis.value(String.class, String.class);
    }

    @Override
    public Optional<LockHandle> tryAcquire(String lockKey, Duration leaseTime) {
        String key = PREFIX + lockKey;
        String value = UUID.randomUUID().toString();
        // SET key value NX PX <leaseMillis>: setAndChanged returns true only when the value was
        // actually written, i.e. the NX guard succeeded and we hold the lock.
        boolean acquired =
                values.setAndChanged(key, value, new SetArgs().nx().px(leaseTime.toMillis()));
        if (acquired) {
            return Optional.of(new ValkeyHandle(redis, key, value));
        }
        return Optional.empty();
    }

    private static final class ValkeyHandle implements LockHandle {
        private final RedisDataSource redis;
        private final String key;
        private final String value;
        private boolean released;

        ValkeyHandle(RedisDataSource redis, String key, String value) {
            this.redis = redis;
            this.key = key;
            this.value = value;
        }

        @Override
        public synchronized void release() {
            if (released) {
                return;
            }
            released = true;
            // Swallow + log: LockHandle is AutoCloseable, so release() runs from close() inside
            // try-with-resources. An uncaught Valkey error here would mask the body's exception.
            // The lease TTL-expires anyway, so a failed explicit release is safe.
            try {
                // EVAL <script> numkeys=1 key value
                redis.execute("EVAL", RELEASE_SCRIPT, "1", key, value);
            } catch (RuntimeException ex) {
                log.warn(
                        "Lock release failed for {} (lease will TTL-expire): {}",
                        key,
                        ex.getMessage());
            }
        }

        @Override
        public synchronized boolean renew(Duration leaseTime) {
            if (released) {
                return false;
            }
            try {
                // EVAL <script> numkeys=1 key value ttlMillis
                Response response =
                        redis.execute(
                                "EVAL",
                                RENEW_SCRIPT,
                                "1",
                                key,
                                value,
                                Long.toString(leaseTime.toMillis()));
                Long result = response == null ? null : response.toLong();
                return result != null && result == 1L;
            } catch (RuntimeException ex) {
                log.warn(
                        "Lock renew failed for {} (treated as lost lease): {}",
                        key,
                        ex.getMessage());
                return false;
            }
        }
    }
}
