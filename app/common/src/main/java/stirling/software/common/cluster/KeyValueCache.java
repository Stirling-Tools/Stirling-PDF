package stirling.software.common.cluster;

import java.time.Duration;
import java.util.Optional;

/** Short-TTL namespaced key/value cache backed by the cluster backplane. */
public interface KeyValueCache {

    void put(String namespace, String key, String value, Duration ttl);

    Optional<String> get(String namespace, String key);

    void evict(String namespace, String key);

    void evictNamespace(String namespace);
}
