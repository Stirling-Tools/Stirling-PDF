package stirling.software.common.cluster.inprocess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import stirling.software.common.cluster.KeyValueCache;

class InProcessKeyValueCacheTest {

    @Test
    void putGetEvict() {
        KeyValueCache cache = new InProcessKeyValueCache();
        cache.put("apikey", "a", "userA", Duration.ofMinutes(1));
        assertEquals("userA", cache.get("apikey", "a").orElseThrow());

        cache.evict("apikey", "a");
        assertFalse(cache.get("apikey", "a").isPresent());
    }

    @Test
    void ttlExpiry() throws InterruptedException {
        KeyValueCache cache = new InProcessKeyValueCache();
        cache.put("ns", "k", "v", Duration.ofMillis(40));
        Thread.sleep(80);
        assertFalse(cache.get("ns", "k").isPresent());
    }

    @Test
    void evictNamespace() {
        KeyValueCache cache = new InProcessKeyValueCache();
        cache.put("ns", "a", "1", Duration.ofMinutes(1));
        cache.put("ns", "b", "2", Duration.ofMinutes(1));
        cache.evictNamespace("ns");
        assertFalse(cache.get("ns", "a").isPresent());
        assertFalse(cache.get("ns", "b").isPresent());
    }
}
