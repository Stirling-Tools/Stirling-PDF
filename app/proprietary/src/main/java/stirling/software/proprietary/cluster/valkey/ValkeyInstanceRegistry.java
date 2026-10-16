package stirling.software.proprietary.cluster.valkey;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.InstanceRegistry;

/** Every operation is single-key, so it is correct on standalone, sentinel and cluster alike. */
@Component
@RequiredArgsConstructor
@ConditionalOnValkeyBackplane
public class ValkeyInstanceRegistry implements InstanceRegistry {

    private static final String PREFIX = "stirling:nodes:";

    // Single-key HSET+PEXPIRE. Atomic server-side, so a crash can never leave the node hash
    // without a TTL, which would mask a dead node as alive forever.
    private static final RedisScript<Long> HSET_WITH_TTL =
            new DefaultRedisScript<>(
                    "redis.call('HSET', KEYS[1], unpack(ARGV, 2));"
                            + " redis.call('PEXPIRE', KEYS[1], ARGV[1]); return 1",
                    Long.class);

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

        List<String> args = new ArrayList<>(1 + fields.size() * 2);
        args.add(Long.toString(ttlMs));
        for (Map.Entry<String, String> f : fields.entrySet()) {
            args.add(f.getKey());
            args.add(f.getValue());
        }
        template.execute(HSET_WITH_TTL, List.of(key), args.toArray());
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
