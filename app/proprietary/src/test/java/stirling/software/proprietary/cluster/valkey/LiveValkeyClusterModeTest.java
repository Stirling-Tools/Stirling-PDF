package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.Container;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import io.lettuce.core.cluster.RedisClusterClient;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.DistributedLock;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.model.ApplicationProperties;

// One node owning all 16384 slots exercises the RedisClusterClient path (rejects MULTI/WATCH).
// It must announce 127.0.0.1:<mappedPort>: Lettuce follows the topology, not the seed URI.
@Testcontainers
@EnabledIf("isDockerAvailable")
class LiveValkeyClusterModeTest {

    private static final String NODE_ID = "cluster-node";
    private static final String RUN = UUID.randomUUID().toString().substring(0, 8);

    // Lifecycle is manual: the cluster must be formed and its announced address fixed up before
    // any client connects, which has to happen after the mapped port is known.
    static final GenericContainer<?> VALKEY =
            new GenericContainer<>(DockerImageName.parse("valkey/valkey:8.0-alpine"))
                    .withExposedPorts(6379)
                    .withCommand(
                            "valkey-server",
                            "--cluster-enabled",
                            "yes",
                            "--cluster-config-file",
                            "/tmp/nodes.conf",
                            "--dir",
                            "/tmp",
                            "--appendonly",
                            "no");

    static boolean isDockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    private static LettuceConnectionFactory factory;
    private static StringRedisTemplate template;

    @BeforeAll
    static void formClusterAndConnect() throws Exception {
        VALKEY.start();
        String host = VALKEY.getHost();
        int port = VALKEY.getMappedPort(6379);
        String announceIp = "localhost".equalsIgnoreCase(host) ? "127.0.0.1" : host;

        cli("config", "set", "cluster-announce-ip", announceIp);
        cli("config", "set", "cluster-announce-port", String.valueOf(port));
        cli("cluster", "addslotsrange", "0", "16383");
        awaitAllSlotsServed();

        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().setEnabled(true);
        p.getCluster().setBackplane("valkey");
        p.getCluster().getNode().setId(NODE_ID);
        p.getCluster().getValkey().setMode("cluster");
        p.getCluster().getValkey().setNodes(List.of(announceIp + ":" + port));
        factory = new ValkeyConnectionConfiguration(p).valkeyConnectionFactory();
        template = new StringRedisTemplate(factory);
    }

    @AfterAll
    static void disconnect() {
        if (factory != null) {
            factory.destroy();
        }
        VALKEY.stop();
    }

    private static Container.ExecResult cli(String... args) throws Exception {
        String[] cmd = new String[args.length + 1];
        cmd[0] = "valkey-cli";
        System.arraycopy(args, 0, cmd, 1, args.length);
        Container.ExecResult res = VALKEY.execInContainer(cmd);
        assertEquals(
                0,
                res.getExitCode(),
                "valkey-cli " + String.join(" ", args) + " failed: " + res.getStderr());
        return res;
    }

    /** cluster_state flips to ok before every slot is served, so both have to be waited on. */
    private static void awaitAllSlotsServed() throws Exception {
        long deadline = System.currentTimeMillis() + 60_000;
        String last = "";
        while (System.currentTimeMillis() < deadline) {
            last = cli("cluster", "info").getStdout();
            if (last.contains("cluster_state:ok") && last.contains("cluster_slots_ok:16384")) {
                return;
            }
            Thread.sleep(250);
        }
        throw new IllegalStateException("cluster never became ready; last CLUSTER INFO:\n" + last);
    }

    @Test
    @DisplayName("cluster mode wires a RedisClusterClient, not a standalone client")
    void clusterModeUsesClusterClient() {
        assertInstanceOf(RedisClusterClient.class, factory.getNativeClient());
    }

    @Test
    @DisplayName("backplane health probe succeeds on Cluster (PING would fan out and fail)")
    void backplaneHealthyOnCluster() {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().getNode().setId(NODE_ID);
        assertTrue(new ValkeyClusterBackplane(p, template).isHealthy());
    }

    @Test
    @DisplayName("JobStore round-trips on Cluster: put, get, reverse index, all, delete")
    void jobStoreRoundTripsOnCluster() {
        ValkeyJobStore store = new ValkeyJobStore(template);
        String jobId = "cl-job-" + RUN;
        String fileId = "cl-file-" + RUN;

        store.put(
                new JobStoreEntry(
                        jobId,
                        JobStoreEntry.JobState.RUNNING,
                        NODE_ID,
                        Instant.now(),
                        null,
                        null,
                        List.of(fileId),
                        Map.of("k", "v")),
                Duration.ofSeconds(60));

        Optional<JobStoreEntry> seen = store.get(jobId);
        assertTrue(seen.isPresent(), "MULTI/EXEC would have been rejected by the cluster client");
        assertEquals(NODE_ID, seen.get().owningNodeId());
        assertEquals(jobId, store.findJobIdByFileId(fileId).orElse(null));
        // Both keys hash to different slots, so this also proves nothing needs a shared key tag.
        assertTrue(
                template.getExpire("stirling:job:" + jobId, java.util.concurrent.TimeUnit.SECONDS)
                        > 0,
                "the single-key script must arm the TTL on Cluster too");
        assertTrue(store.all().stream().anyMatch(e -> jobId.equals(e.jobId())), "SCAN must work");

        store.delete(jobId);
        assertFalse(store.exists(jobId));
        assertFalse(
                store.findJobIdByFileId(fileId).isPresent(),
                "the value-guarded index delete must run on Cluster");
    }

    @Test
    @DisplayName("InstanceRegistry round-trips on Cluster: register, activeNodes, deregister")
    void instanceRegistryRoundTripsOnCluster() {
        ValkeyInstanceRegistry registry = new ValkeyInstanceRegistry(template);
        String nodeId = "cl-node-" + RUN;
        registry.register(
                new ClusterNode(nodeId, "10.0.0.5:8080", Instant.now(), "BOTH"),
                Duration.ofSeconds(60));

        Optional<ClusterNode> looked = registry.lookup(nodeId);
        assertTrue(looked.isPresent(), "register must not need MULTI/EXEC");
        assertEquals("10.0.0.5:8080", looked.get().internalAddress());
        assertTrue(registry.activeNodes().stream().anyMatch(n -> nodeId.equals(n.nodeId())));
        assertTrue(
                template.getExpire(
                                "stirling:nodes:" + nodeId, java.util.concurrent.TimeUnit.SECONDS)
                        > 0,
                "a node hash without a TTL would mask a dead node as alive forever");

        registry.deregister(nodeId);
        assertFalse(registry.lookup(nodeId).isPresent());
    }

    @Test
    @DisplayName("RateLimitStore boots on Cluster and enforces capacity (used to throw at startup)")
    void rateLimitStoreWorksOnCluster() {
        ValkeyRateLimitStore store = new ValkeyRateLimitStore(factory);
        store.initProxyManager();
        try {
            String key = "cl-rl-" + RUN;
            int allowed = 0;
            for (int i = 0; i < 8; i++) {
                if (store.tryConsume(key, 4, Duration.ofSeconds(60)).allowed()) {
                    allowed++;
                }
            }
            assertEquals(4, allowed, "the CAS bucket must stay single-slot and enforce capacity");
        } finally {
            store.shutdown();
        }
    }

    @Test
    @DisplayName("KeyValueCache evictNamespace clears every namespace key on Cluster")
    void keyValueCacheEvictNamespaceOnCluster() {
        ValkeyKeyValueCache cache = new ValkeyKeyValueCache(template);
        String namespace = "cl-ns-" + RUN;
        for (int i = 0; i < 25; i++) {
            cache.put(namespace, "k" + i, "v" + i, Duration.ofSeconds(60));
        }
        assertEquals("v7", cache.get(namespace, "k7").orElse(null));

        cache.evictNamespace(namespace);

        for (int i = 0; i < 25; i++) {
            assertFalse(
                    cache.get(namespace, "k" + i).isPresent(),
                    "bulk UNLINK must fan out per slot on Cluster; k" + i + " survived");
        }
    }

    @Test
    @DisplayName("DistributedLock is single-key and therefore correct on Cluster unchanged")
    void distributedLockWorksOnCluster() {
        ValkeyDistributedLock lock = new ValkeyDistributedLock(template);
        String key = "cl-lock-" + RUN;

        Optional<DistributedLock.LockHandle> held = lock.tryAcquire(key, Duration.ofSeconds(30));
        assertTrue(held.isPresent());
        assertFalse(
                lock.tryAcquire(key, Duration.ofSeconds(30)).isPresent(),
                "a second acquirer must be excluded");
        assertTrue(held.get().renew(Duration.ofSeconds(60)));
        held.get().release();
        assertTrue(
                lock.tryAcquire(key, Duration.ofSeconds(5)).isPresent(), "released lock reusable");
    }
}
