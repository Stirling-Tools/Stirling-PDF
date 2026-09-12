package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettucePoolingClientConfiguration;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.types.RedisClientInfo;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.model.ApplicationProperties;

// Real server. Backplane commands multiplex over one shared native connection, and
// connections without CLIENT SETNAME show as name="" in every Valkey monitor.
@Testcontainers
@EnabledIf("isDockerAvailable")
class LiveValkeyPoolingTest {

    private static final String NODE_ID = "pool-node";
    private static final String EXPECTED_CLIENT_NAME = "stirling-" + NODE_ID;
    private static final int WRITES = 200;

    @Container
    static final GenericContainer<?> VALKEY =
            new GenericContainer<>(DockerImageName.parse("valkey/valkey:8.0-alpine"))
                    .withExposedPorts(6379);

    static boolean isDockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    private static LettuceConnectionFactory factory;
    private static StringRedisTemplate template;

    @BeforeAll
    static void connect() {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().setEnabled(true);
        p.getCluster().setBackplane("valkey");
        p.getCluster().getNode().setId(NODE_ID);
        var valkey = p.getCluster().getValkey();
        valkey.setUrl("redis://" + VALKEY.getHost() + ":" + VALKEY.getMappedPort(6379));
        valkey.getPool().setEnabled(true);
        valkey.getPool().setMaxActive(4);
        // Production bean: pooling, CLIENT SETNAME and the boot handshake all as they run at boot.
        factory = new ValkeyConnectionConfiguration(p).valkeyConnectionFactory();
        template = new StringRedisTemplate(factory);
    }

    @AfterAll
    static void disconnect() {
        if (factory != null) {
            factory.destroy();
        }
    }

    @Test
    @DisplayName("the production bean actually wires a pooling client configuration")
    void factoryIsPooled() {
        assertTrue(
                factory.getClientConfiguration() instanceof LettucePoolingClientConfiguration,
                "pool.enabled=true must reach the factory; nothing else pins the pool wiring");
    }

    @Test
    @DisplayName(WRITES + " job writes multiplex over the single shared native connection")
    void writesMultiplexOverTheSharedNativeConnection() {
        // Not a pooling proof: shareNativeConnection defaults true and no command queues, so
        // nothing borrows from the pool. This pins the multiplexing, which pooling cannot change.
        long before = statLong("stats", "total_connections_received");

        ValkeyJobStore store = new ValkeyJobStore(template);
        for (int i = 0; i < WRITES; i++) {
            store.put(
                    new JobStoreEntry(
                            "pool-job-" + i,
                            JobStoreEntry.JobState.RUNNING,
                            NODE_ID,
                            Instant.now(),
                            null,
                            null,
                            List.of("pool-file-" + i),
                            Map.of("k", "v")),
                    Duration.ofSeconds(60));
        }

        long delta = statLong("stats", "total_connections_received") - before;
        assertTrue(
                delta < 20,
                "backplane writes must reuse the shared connection; "
                        + WRITES
                        + " writes opened "
                        + delta
                        + " new connections");
        long connected = statLong("clients", "connected_clients");
        assertTrue(
                connected <= 6,
                "connection count must stay flat under write load; connected_clients=" + connected);
    }

    @Test
    @DisplayName(
            "every connection is attributable: CLIENT LIST shows stirling-<nodeId>, never \"\"")
    void everyConnectionIsNamed() {
        // Force at least one write so the connection is live before the CLIENT LIST snapshot.
        template.opsForValue().set("pool:probe", "v", Duration.ofSeconds(30));

        List<RedisClientInfo> clients =
                template.execute(
                        (RedisCallback<List<RedisClientInfo>>)
                                c -> c.serverCommands().getClientList());
        assertNotNull(clients);
        assertFalse(clients.isEmpty(), "CLIENT LIST must report at least our own connection");
        for (RedisClientInfo client : clients) {
            assertEquals(
                    EXPECTED_CLIENT_NAME,
                    client.getName(),
                    "an unnamed connection is unattributable in any Valkey monitor; row: "
                            + client);
        }
    }

    private static long statLong(String section, String field) {
        Properties info =
                template.execute((RedisCallback<Properties>) c -> c.serverCommands().info(section));
        assertNotNull(info, "INFO " + section + " must reply");
        String raw = info.getProperty(field);
        assertNotNull(raw, "INFO " + section + " must expose " + field);
        return Long.parseLong(raw.trim());
    }
}
