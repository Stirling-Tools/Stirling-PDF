package stirling.software.common.cluster.inprocess;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import stirling.software.common.cluster.KeyValueCache;

public class InProcessKeyValueCache implements KeyValueCache {

    private final ConcurrentHashMap<String, ConcurrentHashMap<String, Expiring>> namespaces =
            new ConcurrentHashMap<>();

    @Override
    public void put(String namespace, String key, String value, Duration ttl) {
        Instant expiry = ttl == null ? Instant.MAX : Instant.now().plus(ttl);
        namespaces
                .computeIfAbsent(namespace, n -> new ConcurrentHashMap<>())
                .put(key, new Expiring(value, expiry));
    }

    @Override
    public Optional<String> get(String namespace, String key) {
        Map<String, Expiring> ns = namespaces.get(namespace);
        if (ns == null) {
            return Optional.empty();
        }
        Expiring e = ns.get(key);
        if (e == null) {
            return Optional.empty();
        }
        if (e.expiry.isBefore(Instant.now())) {
            ns.remove(key, e);
            return Optional.empty();
        }
        return Optional.of(e.value);
    }

    @Override
    public void evict(String namespace, String key) {
        Map<String, Expiring> ns = namespaces.get(namespace);
        if (ns != null) {
            ns.remove(key);
        }
    }

    @Override
    public void evictNamespace(String namespace) {
        namespaces.remove(namespace);
    }

    private record Expiring(String value, Instant expiry) {}
}
