package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.ServerSocket;
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

import io.lettuce.core.RedisClient;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.model.ApplicationProperties;

// Lettuce takes the primary's address from the SENTINEL'S REPLY, not from the seed URI, so the
// announced address must resolve identically inside the container and on the host.
// Primary and sentinel therefore share one container (localhost = the primary) and both ports are
// published host:container identically, making "127.0.0.1:<port>" true on both sides.
@Testcontainers
@EnabledIf("isDockerAvailable")
class LiveValkeySentinelModeTest {

    private static final String NODE_ID = "sentinel-node";
    private static final String MASTER = "mymaster";
    private static final String RUN = UUID.randomUUID().toString().substring(0, 8);

    private static final int PRIMARY_PORT;
    private static final int SENTINEL_PORT;

    static {
        int[] ports = reserveTwoPorts();
        PRIMARY_PORT = ports[0];
        SENTINEL_PORT = ports[1];
    }

    // Lifecycle is manual: SENTINEL MONITOR must name a host-reachable address, and the sentinel
    // must have seen the primary, before any client connects.
    static final GenericContainer<?> VALKEY =
            new GenericContainer<>(DockerImageName.parse("valkey/valkey:8.0-alpine"))
                    .withExposedPorts(PRIMARY_PORT, SENTINEL_PORT)
                    .withCommand("sh", "-c", bootstrapScript());

    static boolean isDockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    private static LettuceConnectionFactory factory;
    private static StringRedisTemplate template;

    @BeforeAll
    static void monitorPrimaryAndConnect() throws Exception {
        VALKEY.setPortBindings(
                List.of(PRIMARY_PORT + ":" + PRIMARY_PORT, SENTINEL_PORT + ":" + SENTINEL_PORT));
        VALKEY.start();
        String host = VALKEY.getHost();
        String announceIp = "localhost".equalsIgnoreCase(host) ? "127.0.0.1" : host;

        // resolve-hostnames stays off (set in the config): a hostname whose record disappears
        // stalls sentinel's event loop, and Lettuce would then get an address it cannot use.
        cli("sentinel", "monitor", MASTER, announceIp, String.valueOf(PRIMARY_PORT), "1");
        awaitPrimaryMonitored();

        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().setEnabled(true);
        p.getCluster().setBackplane("valkey");
        p.getCluster().getNode().setId(NODE_ID);
        var valkey = p.getCluster().getValkey();
        valkey.setMode("sentinel");
        valkey.getSentinel().setMaster(MASTER);
        valkey.getSentinel().setNodes(List.of(announceIp + ":" + SENTINEL_PORT));
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

    /** Primary in the background, sentinel in the foreground: same netns, so localhost is both. */
    private static String bootstrapScript() {
        return "valkey-server --port "
                + PRIMARY_PORT
                + " --save '' --appendonly no --daemonize yes"
                + " && printf 'port "
                + SENTINEL_PORT
                + "\\ndir /tmp\\nsentinel resolve-hostnames no\\n' > /tmp/sentinel.conf"
                + " && exec valkey-sentinel /tmp/sentinel.conf";
    }

    /** Both sockets are held open at once so the two ports cannot collide. */
    private static int[] reserveTwoPorts() {
        try (ServerSocket first = new ServerSocket(0);
                ServerSocket second = new ServerSocket(0)) {
            return new int[] {first.getLocalPort(), second.getLocalPort()};
        } catch (IOException ex) {
            throw new IllegalStateException("could not reserve local ports for valkey", ex);
        }
    }

    private static Container.ExecResult cli(String... args) throws Exception {
        String[] cmd = new String[args.length + 3];
        cmd[0] = "valkey-cli";
        cmd[1] = "-p";
        cmd[2] = String.valueOf(SENTINEL_PORT);
        System.arraycopy(args, 0, cmd, 3, args.length);
        Container.ExecResult res = VALKEY.execInContainer(cmd);
        assertEquals(
                0,
                res.getExitCode(),
                "valkey-cli " + String.join(" ", args) + " failed: " + res.getStderr());
        return res;
    }

    /** SENTINEL MONITOR returns OK before sentinel has reached the primary; wait for both. */
    private static void awaitPrimaryMonitored() throws Exception {
        long deadline = System.currentTimeMillis() + 60_000;
        String last = "";
        while (System.currentTimeMillis() < deadline) {
            last = cli("sentinel", "master", MASTER).getStdout();
            boolean quorum = cli("sentinel", "ckquorum", MASTER).getStdout().startsWith("OK");
            if (quorum && !last.contains("_down") && last.contains(String.valueOf(PRIMARY_PORT))) {
                return;
            }
            Thread.sleep(250);
        }
        throw new IllegalStateException(
                "sentinel never saw the primary; last SENTINEL MASTER:\n" + last);
    }

    @Test
    @DisplayName("sentinel mode wires a standalone client against the sentinel-resolved primary")
    void sentinelModeUsesSentinelAwareFactory() {
        assertTrue(factory.isRedisSentinelAware(), "the factory must hold a sentinel config");
        assertInstanceOf(RedisClient.class, factory.getNativeClient());
    }

    @Test
    @DisplayName("backplane health probe succeeds through sentinel")
    void backplaneHealthyThroughSentinel() {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().getNode().setId(NODE_ID);
        ValkeyClusterBackplane bp = new ValkeyClusterBackplane(p, template);
        assertEquals("valkey", bp.backplaneType());
        assertTrue(bp.isHealthy(), "sentinel must resolve a writable primary");
    }

    @Test
    @DisplayName("JobStore round-trips through the sentinel-resolved primary")
    void jobStoreRoundTripsThroughSentinel() throws Exception {
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
        assertTrue(
                template.getExpire("stirling:job:" + jobId, java.util.concurrent.TimeUnit.SECONDS)
                        > 0,
                "the single-key script must arm the TTL through sentinel too");
        // Proves the sentinel-announced address is the container's primary, not some other server.
        assertEquals(
                "1",
                onPrimary("exists", "stirling:job:" + jobId).getStdout().trim(),
                "the key must exist on the primary sentinel monitors");

        store.delete(jobId);
        assertFalse(store.exists(jobId));
        assertFalse(store.findJobIdByFileId(fileId).isPresent());
    }

    @Test
    @DisplayName("InstanceRegistry register/lookup/deregister works through sentinel")
    void instanceRegistryThroughSentinel() {
        ValkeyInstanceRegistry registry = new ValkeyInstanceRegistry(template);
        String nodeId = "sent-node-" + RUN;
        registry.register(
                new ClusterNode(nodeId, "10.0.0.9:8080", Instant.now(), "BOTH"),
                Duration.ofSeconds(60));

        Optional<ClusterNode> looked = registry.lookup(nodeId);
        assertTrue(looked.isPresent());
        assertEquals("10.0.0.9:8080", looked.get().internalAddress());
        assertTrue(registry.activeNodes().stream().anyMatch(n -> nodeId.equals(n.nodeId())));
        assertTrue(
                template.getExpire(
                                "stirling:nodes:" + nodeId, java.util.concurrent.TimeUnit.SECONDS)
                        > 0,
                "a node hash without a TTL would mask a dead node as alive forever");

        registry.deregister(nodeId);
        assertFalse(registry.lookup(nodeId).isPresent());
    }

    private static Container.ExecResult onPrimary(String... args) throws Exception {
        String[] cmd = new String[args.length + 3];
        cmd[0] = "valkey-cli";
        cmd[1] = "-p";
        cmd[2] = String.valueOf(PRIMARY_PORT);
        System.arraycopy(args, 0, cmd, 3, args.length);
        return VALKEY.execInContainer(cmd);
    }
}
