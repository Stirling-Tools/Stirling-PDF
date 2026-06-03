package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import stirling.software.common.model.ApplicationProperties;

/**
 * Live failure-injection: a frozen (network-black-holed) Valkey must NOT stall hot-path commands
 * for Lettuce's 60s default. {@link ValkeyConnectionConfiguration} pins a 2s command timeout, so a
 * paused server must surface an error in seconds, and the connection must recover when it returns.
 *
 * <p>Uses {@code docker pause}/{@code unpause} (TCP stays ESTABLISHED but the server never replies)
 * to reproduce a partition rather than {@code stop} (which would fail fast with
 * connection-refused).
 */
@Testcontainers
@EnabledIf("isDockerAvailable")
class LiveValkeyChaosTest {

    @Container
    static final GenericContainer<?> VALKEY =
            new GenericContainer<>(DockerImageName.parse("valkey/valkey:8.0-alpine"))
                    .withExposedPorts(6379);

    static boolean isDockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    private boolean paused;

    private LettuceConnectionFactory productionFactory() {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().setEnabled(true);
        p.getCluster().setBackplane("valkey");
        p.getCluster()
                .getValkey()
                .setUrl("redis://" + VALKEY.getHost() + ":" + VALKEY.getMappedPort(6379));
        p.getCluster().getNode().setId("chaos");
        // Built via the production bean so the real 2s commandTimeout is in effect.
        return new ValkeyConnectionConfiguration(p).valkeyConnectionFactory();
    }

    private void pause() {
        DockerClientFactory.lazyClient().pauseContainerCmd(VALKEY.getContainerId()).exec();
        paused = true;
    }

    private void unpause() {
        DockerClientFactory.lazyClient().unpauseContainerCmd(VALKEY.getContainerId()).exec();
        paused = false;
    }

    @AfterEach
    void ensureUnpaused() {
        if (paused) {
            try {
                unpause();
            } catch (RuntimeException ignored) {
                // container teardown will handle it
            }
        }
    }

    @Test
    @DisplayName("frozen Valkey fails a command in seconds (2s timeout), not Lettuce's 60s default")
    void commandTimeoutFiresUnderPartition() {
        LettuceConnectionFactory factory = productionFactory();
        try {
            StringRedisTemplate t = new StringRedisTemplate(factory);
            t.opsForValue().set("chaos:k", "before");
            assertEquals("before", t.opsForValue().get("chaos:k"));

            pause();
            long start = System.nanoTime();
            // DataAccessException is spring-data-redis's wrapper for the Lettuce timeout.
            assertThrows(DataAccessException.class, () -> t.opsForValue().get("chaos:k"));
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            assertTrue(
                    elapsedMs < 15_000,
                    "command must abort on the ~2s timeout, not hang on the 60s default; elapsed="
                            + elapsedMs
                            + " ms");

            unpause();
            // After the partition heals the client must recover (Lettuce reconnects lazily).
            String recovered = null;
            long deadline = System.currentTimeMillis() + 10_000;
            while (System.currentTimeMillis() < deadline) {
                try {
                    recovered = t.opsForValue().get("chaos:k");
                    break;
                } catch (RuntimeException retry) {
                    Thread.sleep(250);
                }
            }
            assertEquals("before", recovered, "connection must recover after the partition heals");
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } finally {
            factory.destroy();
        }
    }
}
