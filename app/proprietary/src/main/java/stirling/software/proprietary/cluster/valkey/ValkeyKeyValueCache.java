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
        // Bulk unlink in 500-key batches - ceil(n/500) round trips, not n: Lettuce partitions
        // del/unlink by slot and fans out per node, so multi-key is legitimate here on Cluster.
        for (int i = 0; i < keys.size(); i += 500) {
            template.unlink(keys.subList(i, Math.min(i + 500, keys.size())));
        }
    }

    private String buildKey(String namespace, String key) {
        return PREFIX + namespace + ":" + key;
    }
}
