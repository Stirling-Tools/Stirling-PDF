package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.model.ApplicationProperties;

/**
 * Opt-in, never runs in CI: needs STIRLING_TEST_VALKEY_SENTINEL_NODES (comma-separated host:port).
 * Optional STIRLING_TEST_VALKEY_: SENTINEL_MASTER (default mymaster), SENTINEL_PASSWORD, PASSWORD.
 */
@EnabledIfEnvironmentVariable(named = "STIRLING_TEST_VALKEY_SENTINEL_NODES", matches = ".+")
class LiveExternalSentinelTest {

    private static final String NODE_ID = "sentinel-node";
    private static final String RUN = UUID.randomUUID().toString().substring(0, 8);

    private static LettuceConnectionFactory factory;
    private static StringRedisTemplate template;

    @BeforeAll
    static void connect() {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().setEnabled(true);
        p.getCluster().setBackplane("valkey");
        p.getCluster().getNode().setId(NODE_ID);
        var valkey = p.getCluster().getValkey();
        valkey.setMode("sentinel");
        valkey.getSentinel().setMaster(env("STIRLING_TEST_VALKEY_SENTINEL_MASTER", "mymaster"));
        valkey.getSentinel()
                .setNodes(
                        Arrays.stream(
                                        System.getenv("STIRLING_TEST_VALKEY_SENTINEL_NODES")
                                                .split(","))
                                .map(String::trim)
                                .filter(s -> !s.isEmpty())
                                .toList());
        valkey.getSentinel().setPassword(env("STIRLING_TEST_VALKEY_SENTINEL_PASSWORD", ""));
        valkey.setPassword(env("STIRLING_TEST_VALKEY_PASSWORD", ""));
        // Production bean: sentinel discovery, credentials, pooling and the boot handshake.
        factory = new ValkeyConnectionConfiguration(p).valkeyConnectionFactory();
        template = new StringRedisTemplate(factory);
    }

    @AfterAll
    static void disconnect() {
        if (factory != null) {
            factory.destroy();
        }
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    @Test
    @DisplayName("sentinel-resolved primary is reachable and the backplane reports healthy")
    void backplaneHealthyThroughSentinel() {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().getNode().setId(NODE_ID);
        ValkeyClusterBackplane bp = new ValkeyClusterBackplane(p, template);
        assertEquals("valkey", bp.backplaneType());
        assertTrue(bp.isHealthy(), "sentinel must resolve a writable primary");
    }

    @Test
    @DisplayName("JobStore round-trips through the sentinel-resolved primary")
    void jobStoreRoundTripsThroughSentinel() {
        ValkeyJobStore store = new ValkeyJobStore(template);
        String jobId = "sent-job-" + RUN;
        String fileId = "sent-file-" + RUN;

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
        assertTrue(seen.isPresent(), "the write must land on the primary, not a read-only replica");
        assertEquals(NODE_ID, seen.get().owningNodeId());
        assertEquals(jobId, store.findJobIdByFileId(fileId).orElse(null));

        store.delete(jobId);
        assertFalse(store.exists(jobId));
        assertFalse(store.findJobIdByFileId(fileId).isPresent());
    }

    @Test
    @DisplayName("InstanceRegistry register/deregister works through sentinel")
    void instanceRegistryThroughSentinel() {
        ValkeyInstanceRegistry registry = new ValkeyInstanceRegistry(template);
        String nodeId = "sent-node-" + RUN;
        registry.register(
                new ClusterNode(nodeId, "10.0.0.9:8080", Instant.now(), "BOTH"),
                Duration.ofSeconds(60));
        assertTrue(registry.lookup(nodeId).isPresent());
        registry.deregister(nodeId);
        assertFalse(registry.lookup(nodeId).isPresent());
    }
}
