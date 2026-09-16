package stirling.software.common.cluster;

import java.time.Duration;
import java.util.Optional;

/**
 * Short-TTL namespaced key/value cache backed by the cluster backplane.
 *
 * <p>No in-tree caller yet, so the {@code stirling:kv:} keyspace is always empty in practice. Kept
 * as the backplane's cache seam rather than deleted; check a live keyspace before assuming it is in
 * use.
 */
public interface KeyValueCache {

    void put(String namespace, String key, String value, Duration ttl);

    Optional<String> get(String namespace, String key);

    void evict(String namespace, String key);

    void evictNamespace(String namespace);
}
