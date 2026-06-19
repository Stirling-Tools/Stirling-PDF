package stirling.software.proprietary.cluster.valkey;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import io.quarkus.redis.datasource.RedisDataSource;
import io.quarkus.redis.datasource.hash.HashCommands;
import io.quarkus.redis.datasource.keys.KeyCommands;
import io.quarkus.redis.datasource.keys.KeyScanArgs;
import io.quarkus.redis.datasource.keys.KeyScanCursor;
import io.quarkus.redis.datasource.transactions.TransactionResult;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.InstanceRegistry;

/**
 * Valkey-backed {@link InstanceRegistry}. Each node is stored as a hash with a TTL equal to the
 * configured heartbeat TTL; the heartbeat re-arms the TTL.
 */
// Build-time gating: included in the build only when cluster.backplane=valkey; otherwise this bean
// (and its RedisDataSource dependency) is removed so no eager Redis startup observer is generated
// and the in-process @DefaultBean InstanceRegistry satisfies the interface.
@io.quarkus.arc.properties.IfBuildProperty(name = "cluster.backplane", stringValue = "valkey")
@ApplicationScoped
@RequiredArgsConstructor
public class ValkeyInstanceRegistry implements InstanceRegistry {

    private static final String PREFIX = "stirling:nodes:";

    private final RedisDataSource redis;

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
        TransactionResult result =
                redis.withTransaction(
                        tx -> {
                            tx.hash(String.class).hset(key, fields);
                            tx.key(String.class).pexpire(key, ttlMs);
                        });
        // result.discarded() would be true if the transaction was aborted; the heartbeat will
        // re-arm on the next register() so we do not fail hard here.
    }

    @Override
    public Optional<ClusterNode> lookup(String nodeId) {
        return readNode(PREFIX + nodeId);
    }

    @Override
    public Collection<ClusterNode> activeNodes() {
        List<ClusterNode> nodes = new ArrayList<>();
        KeyCommands<String> keys = redis.key(String.class);
        KeyScanCursor<String> cursor = keys.scan(new KeyScanArgs().match(PREFIX + "*").count(256));
        while (cursor.hasNext()) {
            for (String key : cursor.next()) {
                readNode(key).ifPresent(nodes::add);
            }
        }
        return nodes;
    }

    @Override
    public void deregister(String nodeId) {
        redis.key(String.class).del(PREFIX + nodeId);
    }

    private Optional<ClusterNode> readNode(String key) {
        HashCommands<String, String, String> hash = redis.hash(String.class);
        Map<String, String> entries = hash.hgetall(key);
        if (entries == null || entries.isEmpty()) {
            return Optional.empty();
        }
        String nodeId = entries.get("nodeId");
        if (nodeId == null) {
            return Optional.empty();
        }
        Instant heartbeat = Instant.now();
        String hb = entries.get("lastHeartbeat");
        if (hb != null) {
            try {
                heartbeat = Instant.parse(hb);
            } catch (RuntimeException ignored) {
                // keep default
            }
        }
        return Optional.of(
                new ClusterNode(
                        nodeId,
                        entries.getOrDefault("internalAddress", ""),
                        heartbeat,
                        entries.getOrDefault("role", "BOTH")));
    }
}
