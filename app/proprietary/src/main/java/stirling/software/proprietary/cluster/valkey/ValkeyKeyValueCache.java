package stirling.software.proprietary.cluster.valkey;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.cluster.KeyValueCache;

@Component
@RequiredArgsConstructor
@ConditionalOnValkeyBackplane
public class ValkeyKeyValueCache implements KeyValueCache {

    private static final String PREFIX = "stirling:kv:";

    private final StringRedisTemplate template;

    @Override
    public void put(String namespace, String key, String value, Duration ttl) {
        template.opsForValue().set(buildKey(namespace, key), value, ttl);
    }

    @Override
    public Optional<String> get(String namespace, String key) {
        return Optional.ofNullable(template.opsForValue().get(buildKey(namespace, key)));
    }

    @Override
    public void evict(String namespace, String key) {
        template.delete(buildKey(namespace, key));
    }

    @Override
    public void evictNamespace(String namespace) {
        ScanOptions options =
                ScanOptions.scanOptions().match(PREFIX + namespace + ":*").count(256).build();
        List<String> keys = new ArrayList<>();
        try (Cursor<String> cursor = template.scan(options)) {
            while (cursor.hasNext()) {
                keys.add(cursor.next());
            }
        }
        // Batched UNLINK, 500 keys a call. On Cluster spring-data splits a cross-slot batch
        // into one command per key (fanned out per node), so expect n commands there, not n/500.
        for (int i = 0; i < keys.size(); i += 500) {
            template.unlink(keys.subList(i, Math.min(i + 500, keys.size())));
        }
    }

    private String buildKey(String namespace, String key) {
        return PREFIX + namespace + ":" + key;
    }
}
