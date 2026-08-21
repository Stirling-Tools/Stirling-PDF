package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

import stirling.software.common.model.ApplicationProperties;

/**
 * Live AUTH coverage against a password-protected Valkey. The main {@link
 * LiveValkeyIntegrationTest} runs against a no-auth instance, so the credential-bearing URL path
 * (parse -> RedisStandaloneConfiguration -> real AUTH handshake) was otherwise unexercised. Drives
 * the full production bean method {@code valkeyConnectionFactory()} so the parse, credential
 * wiring, and eager-handshake all run exactly as at boot.
 */
@Testcontainers
@EnabledIf("isDockerAvailable")
class LiveValkeyAuthIntegrationTest {

    private static final String PASSWORD = "s3cr3tpw";

    // @Container is intentionally NOT used: lifecycle is managed manually so the container can be
    // shared across the password-only and ACL-user cases without a per-method restart.
    static final GenericContainer<?> VALKEY =
            new GenericContainer<>(DockerImageName.parse("valkey/valkey:8.0-alpine"))
                    .withExposedPorts(6379)
                    .withCommand("valkey-server", "--requirepass", PASSWORD);

    static boolean isDockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @org.junit.jupiter.api.BeforeAll
    static void start() {
        VALKEY.start();
    }

    @org.junit.jupiter.api.AfterAll
    static void stop() {
        VALKEY.stop();
    }

    private static String host() {
        return VALKEY.getHost();
    }

    private static int port() {
        return VALKEY.getMappedPort(6379);
    }

    private ApplicationProperties propsWithUrl(String url) {
        ApplicationProperties p = new ApplicationProperties();
        p.getCluster().setEnabled(true);
        p.getCluster().setBackplane("valkey");
        p.getCluster().getValkey().setUrl(url);
        p.getCluster().getNode().setId("auth-test");
        return p;
    }

    @Test
    @DisplayName("password-only URL (redis://:pw@host) authenticates and round-trips a key")
    void passwordOnlyAuthWorks() {
        String url = "redis://:" + PASSWORD + "@" + host() + ":" + port();
        LettuceConnectionFactory factory =
                new ValkeyConnectionConfiguration(propsWithUrl(url)).valkeyConnectionFactory();
        try {
            StringRedisTemplate t = new StringRedisTemplate(factory);
            t.opsForValue().set("auth:pwonly", "v1");
            assertEquals(
                    "v1",
                    t.opsForValue().get("auth:pwonly"),
                    "password-only AUTH must succeed and the key must round-trip");
        } finally {
            factory.destroy();
        }
    }

    @Test
    @DisplayName("user:password URL (ACL named user) authenticates and round-trips a key")
    void namedUserAuthWorks() throws Exception {
        // Default user is password-protected; create a named ACL user to exercise two-arg AUTH.
        Container.ExecResult res =
                VALKEY.execInContainer(
                        "valkey-cli",
                        "-a",
                        PASSWORD,
                        "ACL",
                        "SETUSER",
                        "alice",
                        "on",
                        ">alicepass",
                        "~*",
                        "+@all");
        assertEquals(0, res.getExitCode(), "ACL SETUSER failed: " + res.getStderr());

        String url = "redis://alice:alicepass@" + host() + ":" + port();
        LettuceConnectionFactory factory =
                new ValkeyConnectionConfiguration(propsWithUrl(url)).valkeyConnectionFactory();
        try {
            StringRedisTemplate t = new StringRedisTemplate(factory);
            t.opsForValue().set("auth:named", "v2");
            assertEquals(
                    "v2",
                    t.opsForValue().get("auth:named"),
                    "named-user AUTH must succeed and the key must round-trip");
        } finally {
            factory.destroy();
        }
    }

    @Test
    @DisplayName(
            "wrong password → fast IllegalStateException (real WRONGPASS short-circuits retries)")
    void wrongPasswordFailsFast() {
        String url = "redis://:wrong-" + PASSWORD + "@" + host() + ":" + port();
        ValkeyConnectionConfiguration cfg = new ValkeyConnectionConfiguration(propsWithUrl(url));

        long start = System.nanoTime();
        IllegalStateException ex =
                assertThrows(IllegalStateException.class, cfg::valkeyConnectionFactory);
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        assertTrue(
                ex.getMessage().toLowerCase().contains("authentication failed"),
                "real Valkey WRONGPASS must be classified as an auth failure; got: "
                        + ex.getMessage());
        // The retry loop is 10 x 3s; a recognised auth failure must abort well before that.
        assertTrue(
                elapsedMs < 10_000,
                "auth failure must short-circuit the 30s retry loop; elapsed=" + elapsedMs + " ms");
    }
}
