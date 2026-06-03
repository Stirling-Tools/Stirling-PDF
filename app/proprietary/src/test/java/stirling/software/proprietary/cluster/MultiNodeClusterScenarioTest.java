package stirling.software.proprietary.cluster;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.KeyValueCache;
import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;
import stirling.software.common.cluster.inprocess.InProcessJobStore;
import stirling.software.common.cluster.inprocess.InProcessKeyValueCache;
import stirling.software.common.cluster.inprocess.InProcessRateLimitStore;

/**
 * Multi-node contract test using in-process impls shared across two "nodes". Verifies cross-node
 * visibility, global rate-limit counters, and cache propagation without requiring Docker.
 * Valkey-specific behavior (MULTI/EXEC atomicity, WATCH races, TTL) is in
 * LiveValkeyIntegrationTest.
 */
class MultiNodeClusterScenarioTest {

    private JobStore sharedJobStore;
    private RateLimitStore sharedRateLimit;
    private KeyValueCache sharedCache;
    private ClusterBackplane backplaneA;
    private ClusterBackplane backplaneB;

    @BeforeEach
    void setUp() {
        sharedJobStore = new InProcessJobStore();
        sharedRateLimit = new InProcessRateLimitStore();
        sharedCache = new InProcessKeyValueCache();
        backplaneA = constBackplane("node-A", "valkey");
        backplaneB = constBackplane("node-B", "valkey");
    }

    @Test
    @DisplayName("async job created on node-A is readable from node-B via shared JobStore")
    void jobStatusVisibleCrossNode() {
        JobStoreEntry entry =
                new JobStoreEntry(
                        "job-1",
                        JobStoreEntry.JobState.RUNNING,
                        "node-A",
                        Instant.now(),
                        null,
                        null,
                        List.of("file-1"),
                        Map.of());
        sharedJobStore.put(entry, Duration.ofMinutes(30));

        Optional<JobStoreEntry> seenOnB = sharedJobStore.get("job-1");
        assertTrue(seenOnB.isPresent(), "node-B must see node-A's job in shared JobStore");
        assertEquals("node-A", seenOnB.get().owningNodeId());
        assertEquals(JobStoreEntry.JobState.RUNNING, seenOnB.get().state());
    }

    @Test
    @DisplayName("global rate limit - capacity counted once across both nodes")
    void rateLimitGlobalAcrossNodes() {
        long capacity = 4L;
        RateLimitDecision a1 =
                sharedRateLimit.tryConsume("user:bob", capacity, Duration.ofMinutes(1));
        RateLimitDecision b1 =
                sharedRateLimit.tryConsume("user:bob", capacity, Duration.ofMinutes(1));
        RateLimitDecision a2 =
                sharedRateLimit.tryConsume("user:bob", capacity, Duration.ofMinutes(1));
        RateLimitDecision b2 =
                sharedRateLimit.tryConsume("user:bob", capacity, Duration.ofMinutes(1));
        RateLimitDecision a3 =
                sharedRateLimit.tryConsume("user:bob", capacity, Duration.ofMinutes(1));

        assertTrue(a1.allowed());
        assertTrue(b1.allowed());
        assertTrue(a2.allowed());
        assertTrue(b2.allowed());
        assertFalse(a3.allowed(), "5th request across both nodes must be rejected (limit=4)");
    }

    @Test
    @DisplayName("KeyValueCache populated on A is observed on B; evict on A propagates")
    void apiKeyCacheVisibleCrossNode() {
        sharedCache.put("apikey", "hash-bob", "bob", Duration.ofSeconds(60));
        assertEquals("bob", sharedCache.get("apikey", "hash-bob").orElse(null));
        sharedCache.evict("apikey", "hash-bob");
        assertFalse(sharedCache.get("apikey", "hash-bob").isPresent());
    }

    @Test
    @DisplayName("backplaneType reports 'valkey' on every node; localNodeId is distinct")
    void backplaneType() {
        assertEquals("valkey", backplaneA.backplaneType());
        assertEquals("valkey", backplaneB.backplaneType());
        assertEquals("node-A", backplaneA.localNodeId());
        assertEquals("node-B", backplaneB.localNodeId());
        assertNotEquals(backplaneA.localNodeId(), backplaneB.localNodeId());
        assertNotNull(backplaneA.localNodeId());
    }

    private ClusterBackplane constBackplane(String nodeId, String type) {
        return new ClusterBackplane() {
            @Override
            public boolean isHealthy() {
                return true;
            }

            @Override
            public String backplaneType() {
                return type;
            }

            @Override
            public String localNodeId() {
                return nodeId;
            }
        };
    }
}
