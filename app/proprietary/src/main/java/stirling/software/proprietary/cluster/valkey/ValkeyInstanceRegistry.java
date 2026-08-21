package stirling.software.proprietary.cluster.valkey;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.InstanceRegistry;

/**
 * Valkey-backed {@link InstanceRegistry}. Each node is stored as a hash with a TTL equal to the
 * configured heartbeat TTL; the heartbeat re-arms the TTL.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnValkeyBackplane
public class ValkeyInstanceRegistry implements InstanceRegistry {

    private static final String PREFIX = "stirling:nodes:";

    private final StringRedisTemplate template;

    @Override
    public void register(ClusterNode node, Duration heartbeatTtl) {
        String key = PREFIX + node.nodeId();
        long ttlMs = heartbeatTtl.toMillis();
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("nodeId", node.nodeId());
        fields.put("internalAddress", node.internalAddress());
        fields.put("role", node.role());
        fields.put("lastHeartbeat", node.lastHeartbeat().toString());

        // MULTI/EXEC so the hash fields and the TTL commit together. Without this, a crash
        // between HSET and EXPIRE leaves the hash with no TTL: it never expires, masks the
        // dead node as alive, and only a subsequent successful register() would re-arm it.
        template.execute(
                (RedisCallback<Object>)
                        connection -> {
                            connection.multi();
                            byte[] keyBytes = key.getBytes(StandardCharsets.UTF_8);
                            Map<byte[], byte[]> hashBytes = new LinkedHashMap<>();
                            for (Map.Entry<String, String> f : fields.entrySet()) {
                                hashBytes.put(
                                        f.getKey().getBytes(StandardCharsets.UTF_8),
                                        f.getValue().getBytes(StandardCharsets.UTF_8));
                            }
                            connection.hashCommands().hMSet(keyBytes, hashBytes);
                            connection.keyCommands().pExpire(keyBytes, ttlMs);
                            connection.exec();
                            return null;
                        });
    }

    @Override
    public Optional<ClusterNode> lookup(String nodeId) {
        return readNode(PREFIX + nodeId);
    }

    @Override
    public Collection<ClusterNode> activeNodes() {
        ScanOptions options = ScanOptions.scanOptions().match(PREFIX + "*").count(256).build();
        List<ClusterNode> nodes = new ArrayList<>();
        try (Cursor<String> cursor = template.scan(options)) {
            while (cursor.hasNext()) {
                readNode(cursor.next()).ifPresent(nodes::add);
            }
        }
        return nodes;
    }

    @Override
    public void deregister(String nodeId) {
        template.delete(PREFIX + nodeId);
    }

    private Optional<ClusterNode> readNode(String key) {
        Map<Object, Object> entries = template.opsForHash().entries(key);
        if (entries == null || entries.isEmpty()) {
            return Optional.empty();
        }
        Object nodeId = entries.get("nodeId");
        if (nodeId == null) {
            return Optional.empty();
        }
        Instant heartbeat = Instant.now();
        Object hb = entries.get("lastHeartbeat");
        if (hb != null) {
            try {
                heartbeat = Instant.parse(hb.toString());
            } catch (RuntimeException ignored) {
                // keep default
            }
        }
        return Optional.of(
                new ClusterNode(
                        nodeId.toString(),
                        String.valueOf(entries.getOrDefault("internalAddress", "")),
                        heartbeat,
                        String.valueOf(entries.getOrDefault("role", "BOTH"))));
    }
}
