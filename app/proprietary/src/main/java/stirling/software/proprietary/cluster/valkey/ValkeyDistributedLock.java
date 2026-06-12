package stirling.software.proprietary.cluster.valkey;

import java.time.Duration;
import java.util.Collections;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;

import io.quarkus.arc.lookup.LookupIfProperty;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Named;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.DistributedLock;

// DI mapping applied here:
//   @Component                  -> @ApplicationScoped
//   @RequiredArgsConstructor    -> explicit @Inject constructor (single injected collaborator)
//   @ConditionalOnValkeyBackplane -> the two stacked @LookupIfProperty guards below (per the note in
//                                    ConditionalOnValkeyBackplane: Quarkus does not transitively
//                                    propagate @LookupIfProperty through the meta-annotation, so the
//                                    guards are repeated directly on this consumer).
//
// TODO: Migration required - this class still depends on spring-data-redis types
// (StringRedisTemplate, RedisScript, DefaultRedisScript). Quarkus has no spring-data-redis; once
// ValkeyConnectionConfiguration migrates its producer onto io.quarkus.redis.datasource.RedisDataSource,
// this lock should be reworked to use RedisDataSource: SET NX PX for tryAcquire and EVAL of the
// release/renew Lua scripts (redisDataSource.execute("EVAL", script, "1", key, value[, ttlMillis])).
// The injected bean is the @Named("valkeyTemplate") StringRedisTemplate produced there, so this file
// and that producer must migrate in lockstep; the spring-data-redis imports are retained until then.
// The Lua scripts and the acquire/release/renew control flow are framework-agnostic and carry over.
@ApplicationScoped
@LookupIfProperty(name = "cluster.enabled", stringValue = "true")
@LookupIfProperty(name = "cluster.backplane", stringValue = "valkey")
@Slf4j
public class ValkeyDistributedLock implements DistributedLock {

    private static final String PREFIX = "stirling:lock:";

    private static final RedisScript<Long> RELEASE_SCRIPT =
            new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
                    Long.class);

    private static final RedisScript<Long> RENEW_SCRIPT =
            new DefaultRedisScript<>(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
                    Long.class);

    private final StringRedisTemplate template;

    @Inject
    public ValkeyDistributedLock(@Named("valkeyTemplate") StringRedisTemplate template) {
        this.template = template;
    }

    @Override
    public Optional<LockHandle> tryAcquire(String lockKey, Duration leaseTime) {
        String key = PREFIX + lockKey;
        String value = UUID.randomUUID().toString();
        Boolean ok = template.opsForValue().setIfAbsent(key, value, leaseTime);
        if (Boolean.TRUE.equals(ok)) {
            return Optional.of(new ValkeyHandle(template, key, value));
        }
        return Optional.empty();
    }

    private static final class ValkeyHandle implements LockHandle {
        private final StringRedisTemplate template;
        private final String key;
        private final String value;
        private boolean released;

        ValkeyHandle(StringRedisTemplate template, String key, String value) {
            this.template = template;
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
                template.execute(RELEASE_SCRIPT, Collections.singletonList(key), value);
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
                Long result =
                        template.execute(
                                RENEW_SCRIPT,
                                Collections.singletonList(key),
                                value,
                                Long.toString(leaseTime.toMillis()));
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
