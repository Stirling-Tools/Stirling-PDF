package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.DistributedLock;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;
import stirling.software.common.model.ApplicationProperties;

/**
 * Opt-in live cluster test against an EXTERNAL Valkey/Redis given by {@code
 * STIRLING_TEST_VALKEY_URL} (e.g. a managed {@code rediss://} endpoint). Unlike {@link
 * LiveValkeyIntegrationTest} (no-auth local container) this drives three independent node stacks
 * through the production {@link ValkeyConnectionConfiguration#valkeyConnectionFactory()} bean - so
 * a {@code rediss://} URL exercises the real TLS handshake (verifyPeer=FULL) and credential path
 * end to end.
 *
 * <p>Skips unless the env var is set, so it never runs in normal CI. No secrets are committed.
 */
@EnabledIfEnvironmentVariable(named = "STIRLING_TEST_VALKEY_URL", matches = "rediss?://.+")
class LiveExternalClusterTest {

    private static final int NODES = 3;
    private static final String RUN = UUID.randomUUID().toString().substring(0, 8);

    private static final List<LettuceConnectionFactory> factories = new ArrayList<>();
    private static final List<StringRedisTemplate> templates = new ArrayList<>();

    @BeforeAll
    static void connectAllNodes() {
        String url = System.getenv("STIRLING_TEST_VALKEY_URL");
        for (int i = 0; i < NODES; i++) {
            ApplicationProperties p = new ApplicationProperties();
            p.getCluster().setEnabled(true);
            p.getCluster().setBackplane("valkey");
            p.getCluster().getValkey().setUrl(url);
            p.getCluster().getNode().setId(nodeId(i));
            // Production bean: parse + credentials + TLS + eager PING handshake (proves reachable).
            LettuceConnectionFactory f =
                    new ValkeyConnectionConfiguration(p).valkeyConnectionFactory();
            factories.add(f);
            templates.add(new StringRedisTemplate(f));
        }
    }

    @AfterAll
    static void disconnect() {
        for (LettuceConnectionFactory f : factories) {
            try {
                f.destroy();
            } catch (RuntimeException ignored) {
                // best effort
            }
        }
    }

    private static String nodeId(int i) {
        return "ext-" + RUN + "-node-" + (i + 1);
    }

    private ApplicationProperties propsForNode(int i) {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().setEnabled(true);
        p.getCluster().setBackplane("valkey");
        p.getCluster().getNode().setId(nodeId(i));
        return p;
    }

    @Test
    @DisplayName("TLS reachability: every node's backplane reports healthy over the external URL")
    void allNodesHealthyOverTls() {
        for (int i = 0; i < NODES; i++) {
            ValkeyClusterBackplane bp =
                    new ValkeyClusterBackplane(propsForNode(i), templates.get(i));
            assertTrue(bp.isHealthy(), nodeId(i) + " must reach the external Valkey (PING)");
            assertEquals(nodeId(i), bp.localNodeId());
        }
    }

    @Test
    @DisplayName("3-node registry: each node sees all peers; deregister drops one cluster-wide")
    void threeNodeRegistryConverges() {
        List<ValkeyInstanceRegistry> regs = new ArrayList<>();
        for (int i = 0; i < NODES; i++) {
            regs.add(new ValkeyInstanceRegistry(templates.get(i)));
        }
        for (int i = 0; i < NODES; i++) {
            regs.get(i)
                    .register(
                            new ClusterNode(
                                    nodeId(i), "10.0.0." + i + ":8080", Instant.now(), "BOTH"),
                            Duration.ofSeconds(30));
        }
        try {
            // Node 0's view must include all three registrations made on three connections.
            for (int i = 0; i < NODES; i++) {
                final String id = nodeId(i);
                boolean seenByNode0 =
                        regs.get(0).activeNodes().stream().anyMatch(n -> id.equals(n.nodeId()));
                assertTrue(seenByNode0, "node-0 must see " + id + " registered by another node");
            }
            regs.get(1).deregister(nodeId(2));
            assertFalse(
                    regs.get(0).lookup(nodeId(2)).isPresent(),
                    "deregister on node-1 must be visible from node-0");
        } finally {
            regs.get(0).deregister(nodeId(0));
            regs.get(1).deregister(nodeId(1));
        }
    }

    @Test
    @DisplayName(
            "Cross-node JobStore: put on node-0 visible on node-1/2; delete on node-2 clears it")
    void jobStoreVisibleAcrossNodes() {
        ValkeyJobStore s0 = new ValkeyJobStore(templates.get(0));
        ValkeyJobStore s1 = new ValkeyJobStore(templates.get(1));
        ValkeyJobStore s2 = new ValkeyJobStore(templates.get(2));
        String jobId = "ext-job-" + RUN;
        String fileId = "ext-file-" + RUN;

        s0.put(
                new JobStoreEntry(
                        jobId,
                        JobStoreEntry.JobState.RUNNING,
                        nodeId(0),
                        Instant.now(),
                        null,
                        null,
                        List.of(fileId),
                        Map.of("k", "v")),
                Duration.ofSeconds(60));

        Optional<JobStoreEntry> onNode1 = s1.get(jobId);
        assertTrue(onNode1.isPresent(), "node-1 must see node-0's job write");
        assertEquals(nodeId(0), onNode1.get().owningNodeId());
        assertEquals(jobId, s2.findJobIdByFileId(fileId).orElse(null), "reverse index visible too");

        s2.delete(jobId);
        assertFalse(s0.exists(jobId), "delete on node-2 must clear the hash for node-0");
        assertFalse(
                s1.findJobIdByFileId(fileId).isPresent(),
                "delete on node-2 must clear the reverse index for node-1");
    }

    @Test
    @DisplayName("Global rate limit: ONE shared budget enforced across all three nodes")
    void rateLimitGlobalAcrossThreeNodes() {
        List<ValkeyRateLimitStore> stores = new ArrayList<>();
        for (int i = 0; i < NODES; i++) {
            ValkeyRateLimitStore s = new ValkeyRateLimitStore(factories.get(i));
            s.initProxyManager();
            stores.add(s);
        }
        String key = "ext-rl-" + RUN;
        long capacity = 6;
        AtomicInteger allowed = new AtomicInteger();
        for (int i = 0; i < 12; i++) {
            RateLimitDecision d =
                    stores.get(i % NODES).tryConsume(key, capacity, Duration.ofSeconds(60));
            if (d.allowed()) {
                allowed.incrementAndGet();
            }
        }
        assertEquals(
                capacity,
                allowed.get(),
                "exactly the global capacity must be allowed across all three nodes");
    }

    @Test
    @DisplayName("Distributed lock: held by node-0 excludes node-1/2; stale release cannot steal")
    void distributedLockAcrossNodes() throws InterruptedException {
        ValkeyDistributedLock l0 = new ValkeyDistributedLock(templates.get(0));
        ValkeyDistributedLock l1 = new ValkeyDistributedLock(templates.get(1));
        ValkeyDistributedLock l2 = new ValkeyDistributedLock(templates.get(2));
        String key = "ext-lock-" + RUN;

        Optional<DistributedLock.LockHandle> a = l0.tryAcquire(key, Duration.ofSeconds(30));
        assertTrue(a.isPresent());
        assertFalse(l1.tryAcquire(key, Duration.ofSeconds(30)).isPresent(), "node-1 excluded");
        assertFalse(l2.tryAcquire(key, Duration.ofSeconds(30)).isPresent(), "node-2 excluded");
        a.get().release();
        Optional<DistributedLock.LockHandle> b = l1.tryAcquire(key, Duration.ofSeconds(30));
        assertTrue(b.isPresent(), "node-1 acquires after node-0 releases");

        // Short lease that expires, then node-2 takes it; node-1's stale release must not steal.
        String key2 = "ext-lock2-" + RUN;
        Optional<DistributedLock.LockHandle> shortHeld =
                l1.tryAcquire(key2, Duration.ofMillis(500));
        assertTrue(shortHeld.isPresent());
        Thread.sleep(900);
        Optional<DistributedLock.LockHandle> stolen = l2.tryAcquire(key2, Duration.ofSeconds(30));
        assertTrue(stolen.isPresent(), "node-2 acquires after node-1's lease expires");
        shortHeld.get().release(); // value-checked no-op
        assertFalse(
                l0.tryAcquire(key2, Duration.ofMillis(200)).isPresent(),
                "node-2 still holds; node-1's stale release must not have stolen it");

        b.get().release();
        stolen.get().release();
    }

    @Test
    @DisplayName("KeyValueCache: put on node-0 readable on node-1; evict visible on node-2")
    void keyValueCacheAcrossNodes() {
        ValkeyKeyValueCache c0 = new ValkeyKeyValueCache(templates.get(0));
        ValkeyKeyValueCache c1 = new ValkeyKeyValueCache(templates.get(1));
        ValkeyKeyValueCache c2 = new ValkeyKeyValueCache(templates.get(2));
        String field = "ext-cache-" + RUN;

        c0.put("apikey", field, "alice", Duration.ofSeconds(60));
        assertEquals("alice", c1.get("apikey", field).orElse(null), "node-1 reads node-0's cache");
        c2.evict("apikey", field);
        assertFalse(c0.get("apikey", field).isPresent(), "evict on node-2 visible on node-0");
    }
}
