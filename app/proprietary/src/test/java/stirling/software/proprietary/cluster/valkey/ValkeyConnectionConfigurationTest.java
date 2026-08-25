package stirling.software.proprietary.cluster.valkey;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atMost;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.redis.RedisSystemException;
import org.springframework.data.redis.connection.ClusterInfo;
import org.springframework.data.redis.connection.RedisClusterCommands;
import org.springframework.data.redis.connection.RedisClusterConfiguration;
import org.springframework.data.redis.connection.RedisClusterConnection;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisKeyCommands;
import org.springframework.data.redis.connection.RedisNode;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisSentinelConfiguration;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettucePoolingClientConfiguration;

import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.SslVerifyMode;
import io.lettuce.core.api.StatefulConnection;
import io.lettuce.core.cluster.ClusterClientOptions;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;
import stirling.software.common.model.ApplicationProperties.Cluster.Valkey;
import stirling.software.common.model.ApplicationProperties.Cluster.Valkey.ValkeyMode;
import stirling.software.proprietary.cluster.valkey.ValkeyConnectionConfiguration.Endpoint;

// Boot-time connection wiring. WRONGPASS/NOAUTH/NOPERM are unrecoverable, so the handshake
// must fail after one attempt instead of burning the 30s retry loop.
class ValkeyConnectionConfigurationTest {

    private static final Duration TIMEOUT = Duration.ofMillis(2000);
    private static final Duration TOPOLOGY = Duration.ofMillis(30000);

    private static Valkey.Pool pooling(boolean enabled) {
        Valkey.Pool pool = new Valkey.Pool();
        pool.setEnabled(enabled);
        return pool;
    }

    private static LettuceClientConfiguration clientConfig(boolean tls, boolean skipCertVerify) {
        return ValkeyConnectionConfiguration.buildClientConfiguration(
                tls,
                skipCertVerify,
                "stirling-test",
                TIMEOUT,
                pooling(true),
                ValkeyMode.STANDALONE,
                TOPOLOGY);
    }

    private static RedisKeyCommands stubKeyCommands(RedisConnection conn) {
        RedisKeyCommands keyCommands = mock(RedisKeyCommands.class);
        when(conn.keyCommands()).thenReturn(keyCommands);
        return keyCommands;
    }

    private static ClusterInfo clusterInfo(String state, String slotsOk) {
        Properties p = new Properties();
        p.setProperty("cluster_state", state);
        p.setProperty("cluster_slots_ok", slotsOk);
        return new ClusterInfo(p);
    }

    @Test
    @DisplayName("WRONGPASS surfaces in one attempt (no 30s retry loop)")
    void wrongpass_failsImmediately_withoutRetries() {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisConnection conn = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        RedisKeyCommands keyCommands = stubKeyCommands(conn);
        RedisCommandExecutionException auth =
                new RedisCommandExecutionException("WRONGPASS invalid username-password pair");
        when(keyCommands.exists(any(byte[].class)))
                .thenThrow(new RedisSystemException("Error in execution", auth));

        long start = System.nanoTime();
        IllegalStateException ex =
                assertThrows(
                        IllegalStateException.class,
                        () ->
                                ValkeyConnectionConfiguration.eagerHandshake(
                                        factory, "valkey:6379", false, false, "stirling-test"));
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        verify(factory, times(1)).getConnection();
        verify(keyCommands, times(1)).exists(any(byte[].class));
        assertTrue(
                elapsedMs < 1500,
                "Auth failure must short-circuit retries; elapsed=" + elapsedMs + " ms");
        assertTrue(
                ex.getMessage().contains("Valkey authentication failed"),
                "Error message must explain the auth failure; got: " + ex.getMessage());
        verify(factory, atMost(1)).destroy();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "NOAUTH Authentication required.",
                "NOPERM this user has no permissions to run the 'exists' command"
            })
    @DisplayName("NOAUTH/NOPERM surface in one attempt")
    void authErrors_failImmediately(String serverError) {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisConnection conn = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        RedisKeyCommands keyCommands = stubKeyCommands(conn);
        when(keyCommands.exists(any(byte[].class)))
                .thenThrow(
                        new RedisSystemException(
                                "Error in execution",
                                new RedisCommandExecutionException(serverError)));

        assertThrows(
                IllegalStateException.class,
                () ->
                        ValkeyConnectionConfiguration.eagerHandshake(
                                factory, "v:6379", false, false, "stirling-test"));
        verify(keyCommands, times(1)).exists(any(byte[].class));
    }

    @Test
    @DisplayName("handshake probes with a single-key EXISTS, never PING (cluster fans PING out)")
    void handshakeUsesSingleKeyExistsNotPing() {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisConnection conn = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        RedisKeyCommands keyCommands = stubKeyCommands(conn);
        when(keyCommands.exists(any(byte[].class))).thenReturn(Boolean.FALSE);

        long start = System.nanoTime();
        ValkeyConnectionConfiguration.eagerHandshake(
                factory, "valkey:6379", false, false, "stirling-test");
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        verify(keyCommands, times(1)).exists(any(byte[].class));
        verify(conn, never()).ping();
        verify(conn, times(1)).close();
        verify(factory, never()).destroy();
        assertTrue(elapsedMs < 1000, "success must not sleep; elapsed=" + elapsedMs + " ms");
    }

    @Test
    @DisplayName("standalone handshake never asks for CLUSTER INFO, even on a cluster connection")
    void standaloneHandshakeSkipsClusterInfo() {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisClusterConnection conn = mock(RedisClusterConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        when(stubKeyCommands(conn).exists(any(byte[].class))).thenReturn(Boolean.FALSE);

        ValkeyConnectionConfiguration.eagerHandshake(
                factory, "valkey:6379", false, false, "stirling-test");

        verify(conn, never()).clusterCommands();
    }

    @Test
    @DisplayName("cluster handshake accepts state=ok with all 16384 slots covered")
    void clusterHandshakeAcceptsHealthyCluster() {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisClusterConnection conn = mock(RedisClusterConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        when(stubKeyCommands(conn).exists(any(byte[].class))).thenReturn(Boolean.FALSE);
        RedisClusterCommands clusterCommands = mock(RedisClusterCommands.class);
        when(conn.clusterCommands()).thenReturn(clusterCommands);
        when(clusterCommands.clusterGetClusterInfo()).thenReturn(clusterInfo("ok", "16384"));

        ValkeyConnectionConfiguration.eagerHandshake(
                factory, "nodes=valkey-1:6379", false, true, "stirling-test");

        verify(clusterCommands, times(1)).clusterGetClusterInfo();
        verify(factory, never()).destroy();
    }

    @Test
    @DisplayName("cluster handshake retries while cluster_state is not ok, then fails boot")
    void clusterHandshakeRetriesWhileClusterStateIsNotOk() throws Exception {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisClusterConnection conn = mock(RedisClusterConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        when(stubKeyCommands(conn).exists(any(byte[].class))).thenReturn(Boolean.FALSE);
        RedisClusterCommands clusterCommands = mock(RedisClusterCommands.class);
        when(conn.clusterCommands()).thenReturn(clusterCommands);
        when(clusterCommands.clusterGetClusterInfo()).thenReturn(clusterInfo("fail", "0"));

        // Interrupting mid-backoff exits the retry loop immediately, so the "retries then throws"
        // contract is asserted without waiting out the real 10 x 3s boot budget.
        Throwable thrown =
                runInterrupted(
                        () ->
                                ValkeyConnectionConfiguration.eagerHandshake(
                                        factory, "nodes=valkey-1:6379", false, true, "stirling-c"));

        assertInstanceOf(IllegalStateException.class, thrown);
        assertTrue(
                thrown.getMessage().contains("Valkey unreachable at boot"),
                "a never-ready cluster must fail boot; got: " + thrown.getMessage());
        assertTrue(
                thrown.getMessage().contains("cluster_state is not ok"),
                "the boot failure must name the cluster-state cause; got: " + thrown.getMessage());
        verify(factory, times(1)).destroy();
    }

    @Test
    @DisplayName("cluster handshake rejects partial slot coverage even when state=ok")
    void clusterHandshakeRejectsPartialSlotCoverage() throws Exception {
        LettuceConnectionFactory factory = mock(LettuceConnectionFactory.class);
        RedisClusterConnection conn = mock(RedisClusterConnection.class);
        when(factory.getConnection()).thenReturn(conn);
        when(stubKeyCommands(conn).exists(any(byte[].class))).thenReturn(Boolean.FALSE);
        RedisClusterCommands clusterCommands = mock(RedisClusterCommands.class);
        when(conn.clusterCommands()).thenReturn(clusterCommands);
        when(clusterCommands.clusterGetClusterInfo()).thenReturn(clusterInfo("ok", "10923"));

        Throwable thrown =
                runInterrupted(
                        () ->
                                ValkeyConnectionConfiguration.eagerHandshake(
                                        factory, "nodes=valkey-1:6379", false, true, "stirling-c"));

        assertInstanceOf(IllegalStateException.class, thrown);
        assertTrue(
                thrown.getMessage().contains("10923"),
                "the failure must report the covered slot count; got: " + thrown.getMessage());
    }

    private static Throwable runInterrupted(Runnable handshake) throws Exception {
        AtomicReference<Throwable> thrown = new AtomicReference<>();
        Thread t =
                new Thread(
                        () -> {
                            try {
                                handshake.run();
                            } catch (Throwable ex) {
                                thrown.set(ex);
                            }
                        },
                        "valkey-handshake-test");
        t.start();
        Thread.sleep(300);
        t.interrupt();
        t.join(10_000);
        assertFalse(t.isAlive(), "handshake must abort promptly once interrupted");
        assertNotNull(thrown.get(), "an unreachable target must fail boot");
        return thrown.get();
    }

    @Test
    @DisplayName("isAuthFailure - direct RedisCommandExecutionException with auth prefix")
    void isAuthFailure_directRedisCommandExecutionException() {
        assertTrue(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisCommandExecutionException("WRONGPASS bad password")));
        assertTrue(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisCommandExecutionException("NOAUTH required")));
        assertTrue(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisCommandExecutionException("NOPERM denied")));
    }

    @Test
    @DisplayName("isAuthFailure - wrapped inside RedisSystemException (production path)")
    void isAuthFailure_wrappedBySpring() {
        assertTrue(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisSystemException(
                                "Error in execution",
                                new RedisCommandExecutionException("WRONGPASS bad password"))));
    }

    @Test
    @DisplayName("isAuthFailure - connection and cluster-state errors are NOT auth failures")
    void isAuthFailure_connectionErrorReturnsFalse() {
        assertFalse(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new RedisSystemException(
                                "Redis connection failed",
                                new io.lettuce.core.RedisConnectionException(
                                        "Connection refused"))));
        assertFalse(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new IllegalStateException("Valkey EXISTS probe returned no reply")));
        assertFalse(
                ValkeyConnectionConfiguration.isAuthFailure(
                        new IllegalStateException(
                                "Valkey cluster_state is not ok (cluster is not serving all slots"
                                        + " yet)")));
    }

    @Test
    @DisplayName("TLS on, skipCertVerification=false → useSsl + verifyPeer=FULL (default)")
    void tls_defaultEnforcesFullPeerVerification() {
        LettuceClientConfiguration cfg = clientConfig(true, false);
        assertTrue(cfg.isUseSsl(), "TLS must be enabled");
        assertSame(SslVerifyMode.FULL, cfg.getVerifyMode());
        assertTrue(cfg.isVerifyPeer());
    }

    @Test
    @DisplayName("TLS on, skipCertVerification=true → verifyPeer=NONE (dev override)")
    void tls_skipCertVerificationOptOut() {
        LettuceClientConfiguration cfg = clientConfig(true, true);
        assertTrue(cfg.isUseSsl());
        assertSame(SslVerifyMode.NONE, cfg.getVerifyMode());
    }

    @Test
    @DisplayName("TLS off → no SSL, verify flag default (skipCertVerification ignored)")
    void noTls_ignoresSkipFlag() {
        LettuceClientConfiguration cfg = clientConfig(false, true);
        assertFalse(cfg.isUseSsl());
    }

    @Nested
    @DisplayName("buildClientConfiguration()")
    class BuildClientConfiguration {

        @Test
        @DisplayName("pooling on yields a LettucePoolingClientConfiguration")
        void poolingOnProducesPoolingConfiguration() {
            LettuceClientConfiguration cfg =
                    ValkeyConnectionConfiguration.buildClientConfiguration(
                            false,
                            false,
                            "stirling-n1",
                            TIMEOUT,
                            pooling(true),
                            ValkeyMode.STANDALONE,
                            TOPOLOGY);
            assertInstanceOf(LettucePoolingClientConfiguration.class, cfg);
        }

        @Test
        @DisplayName("pooling off yields a plain (non-pooling) client configuration")
        void poolingOffProducesPlainConfiguration() {
            LettuceClientConfiguration cfg =
                    ValkeyConnectionConfiguration.buildClientConfiguration(
                            false,
                            false,
                            "stirling-n1",
                            TIMEOUT,
                            pooling(false),
                            ValkeyMode.STANDALONE,
                            TOPOLOGY);
            assertFalse(
                    cfg instanceof LettucePoolingClientConfiguration,
                    "pool.enabled=false must not silently keep pooling");
        }

        @Test
        @DisplayName("TLS survives pooling (poolConfig must be applied before useSsl)")
        void tlsSurvivesPooling() {
            LettuceClientConfiguration cfg =
                    ValkeyConnectionConfiguration.buildClientConfiguration(
                            true,
                            false,
                            "stirling-n1",
                            TIMEOUT,
                            pooling(true),
                            ValkeyMode.STANDALONE,
                            TOPOLOGY);
            assertInstanceOf(LettucePoolingClientConfiguration.class, cfg);
            assertTrue(cfg.isUseSsl());
            assertSame(SslVerifyMode.FULL, cfg.getVerifyMode());
        }

        @Test
        @DisplayName("clientName is set so CLIENT LIST attributes load to a Stirling node")
        void clientNameIsApplied() {
            LettuceClientConfiguration cfg = clientConfig(false, false);
            assertEquals("stirling-test", cfg.getClientName().orElse(null));
        }

        @Test
        @DisplayName("commandTimeout comes from the configured value, not Lettuce's 60s default")
        void commandTimeoutIsApplied() {
            LettuceClientConfiguration cfg =
                    ValkeyConnectionConfiguration.buildClientConfiguration(
                            false,
                            false,
                            "stirling-n1",
                            Duration.ofMillis(750),
                            pooling(true),
                            ValkeyMode.STANDALONE,
                            TOPOLOGY);
            assertEquals(Duration.ofMillis(750), cfg.getCommandTimeout());
        }

        @Test
        @DisplayName("cluster mode installs ClusterClientOptions with periodic topology refresh")
        void clusterModeInstallsClusterClientOptions() {
            LettuceClientConfiguration cfg =
                    ValkeyConnectionConfiguration.buildClientConfiguration(
                            false,
                            false,
                            "stirling-n1",
                            TIMEOUT,
                            pooling(true),
                            ValkeyMode.CLUSTER,
                            Duration.ofMillis(15000));
            ClusterClientOptions options =
                    assertInstanceOf(
                            ClusterClientOptions.class,
                            cfg.getClientOptions().orElse(null),
                            "spring-data drops anything that is not ClusterClientOptions");
            assertTrue(options.getTopologyRefreshOptions().isPeriodicRefreshEnabled());
            assertEquals(
                    Duration.ofMillis(15000),
                    options.getTopologyRefreshOptions().getRefreshPeriod());
            assertFalse(
                    options.getTopologyRefreshOptions().getAdaptiveRefreshTriggers().isEmpty(),
                    "without adaptive triggers the client hammers a demoted master until the next"
                            + " periodic refresh");
        }

        @Test
        @DisplayName("standalone and sentinel do not install ClusterClientOptions")
        void nonClusterModesHaveNoClusterClientOptions() {
            for (ValkeyMode mode : List.of(ValkeyMode.STANDALONE, ValkeyMode.SENTINEL)) {
                LettuceClientConfiguration cfg =
                        ValkeyConnectionConfiguration.buildClientConfiguration(
                                false,
                                false,
                                "stirling-n1",
                                TIMEOUT,
                                pooling(true),
                                mode,
                                TOPOLOGY);
                assertFalse(
                        cfg.getClientOptions().orElse(null) instanceof ClusterClientOptions,
                        mode + " must not carry cluster client options");
            }
        }
    }

    @Nested
    @DisplayName("toPoolConfig()")
    class ToPoolConfig {

        @Test
        @DisplayName("every pool property maps onto the commons-pool2 config")
        void poolPropertiesMapThrough() {
            Valkey.Pool pool = new Valkey.Pool();
            pool.setMaxActive(9);
            pool.setMaxIdle(7);
            pool.setMinIdle(3);
            pool.setMaxWaitMillis(1234);
            pool.setTimeBetweenEvictionRunsMillis(4321);
            pool.setTestOnBorrow(true);

            GenericObjectPoolConfig<StatefulConnection<?, ?>> cfg =
                    ValkeyConnectionConfiguration.toPoolConfig(pool);

            assertEquals(9, cfg.getMaxTotal());
            assertEquals(7, cfg.getMaxIdle());
            assertEquals(3, cfg.getMinIdle());
            assertEquals(Duration.ofMillis(1234), cfg.getMaxWaitDuration());
            assertEquals(Duration.ofMillis(4321), cfg.getDurationBetweenEvictionRuns());
            assertTrue(cfg.getTestOnBorrow());
        }

        @Test
        @DisplayName("testOnBorrow=false is honoured")
        void testOnBorrowCanBeDisabled() {
            Valkey.Pool pool = new Valkey.Pool();
            pool.setTestOnBorrow(false);
            assertFalse(ValkeyConnectionConfiguration.toPoolConfig(pool).getTestOnBorrow());
        }
    }

    @Nested
    @DisplayName("standaloneConfiguration()")
    class StandaloneConfiguration {

        @Test
        @DisplayName("host, port and explicit credentials land on the configuration")
        void hostPortAndCredentials() {
            RedisStandaloneConfiguration cfg =
                    ValkeyConnectionConfiguration.standaloneConfiguration(
                            new Endpoint("valkey", 6380, false, null, null), "alice", "s3cret");
            assertEquals("valkey", cfg.getHostName());
            assertEquals(6380, cfg.getPort());
            assertEquals("alice", cfg.getUsername());
            assertEquals("s3cret", passwordOf(cfg.getPassword()));
        }

        @Test
        @DisplayName("null credentials leave the configuration unauthenticated")
        void nullCredentialsLeaveNoAuth() {
            RedisStandaloneConfiguration cfg =
                    ValkeyConnectionConfiguration.standaloneConfiguration(
                            new Endpoint("valkey", 6379, false, "from-url", "from-url-pw"),
                            null,
                            null);
            assertNull(cfg.getUsername());
            assertFalse(
                    cfg.getPassword().isPresent(),
                    "credential merging belongs to the bean method, not to this builder");
        }
    }

    @Nested
    @DisplayName("sentinelConfiguration()")
    class SentinelConfiguration {

        private Valkey sentinelProps() {
            Valkey v = new Valkey();
            v.setMode("sentinel");
            v.getSentinel().setMaster("mymaster");
            v.getSentinel()
                    .setNodes(List.of("sentinel-1:26379", "sentinel-2:26379", "sentinel-3:26379"));
            return v;
        }

        @Test
        @DisplayName("master name and every sentinel endpoint are wired")
        void masterAndSentinels() {
            RedisSentinelConfiguration cfg =
                    ValkeyConnectionConfiguration.sentinelConfiguration(
                            sentinelProps(), null, null);
            assertEquals("mymaster", cfg.getMaster().getName());
            Set<RedisNode> sentinels = cfg.getSentinels();
            assertEquals(3, sentinels.size());
            assertTrue(
                    sentinels.stream()
                            .anyMatch(
                                    n ->
                                            "sentinel-2".equals(n.getHost())
                                                    && Integer.valueOf(26379).equals(n.getPort())),
                    "each host:port must be parsed, not bound whole as a hostname");
        }

        @Test
        @DisplayName("a bare sentinel host is rejected - the port is never defaulted silently")
        void bareSentinelHostIsRejected() {
            Valkey v = sentinelProps();
            v.getSentinel().setNodes(List.of("sentinel-1"));
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () ->
                                    ValkeyConnectionConfiguration.sentinelConfiguration(
                                            v, null, null));
            assertTrue(ex.getMessage().contains("cluster.valkey.sentinel.nodes"));
            assertTrue(
                    ex.getMessage().contains("sentinel-1:26379"),
                    "message must show the sentinel port in the example; got: " + ex.getMessage());
        }

        @Test
        @DisplayName("sentinel credentials are SEPARATE from the data-node credentials")
        void sentinelCredentialsAreSeparate() {
            Valkey v = sentinelProps();
            v.getSentinel().setUsername("sentinel-user");
            v.getSentinel().setPassword("sentinel-pw");

            RedisSentinelConfiguration cfg =
                    ValkeyConnectionConfiguration.sentinelConfiguration(v, "data-user", "data-pw");

            assertEquals("data-user", cfg.getUsername());
            assertEquals("data-pw", passwordOf(cfg.getPassword()));
            assertEquals("sentinel-user", cfg.getSentinelUsername());
            assertEquals("sentinel-pw", passwordOf(cfg.getSentinelPassword()));
        }

        @Test
        @DisplayName("a blank sentinel password leaves SENTINEL auth unset (data auth untouched)")
        void blankSentinelPasswordIsNotInherited() {
            RedisSentinelConfiguration cfg =
                    ValkeyConnectionConfiguration.sentinelConfiguration(
                            sentinelProps(), null, "data-pw");
            assertEquals("data-pw", passwordOf(cfg.getPassword()));
            assertFalse(
                    cfg.getSentinelPassword().isPresent(),
                    "data password must NOT silently become the sentinel password");
        }
    }

    @Nested
    @DisplayName("clusterConfiguration()")
    class ClusterConfigurationTests {

        private Valkey clusterProps() {
            Valkey v = new Valkey();
            v.setMode("cluster");
            v.setNodes(List.of("valkey-1:6379", "valkey-2:6380", "valkey-3:6381"));
            return v;
        }

        @Test
        @DisplayName("every seed node is parsed into a host/port cluster node")
        void seedNodesAreParsed() {
            RedisClusterConfiguration cfg =
                    ValkeyConnectionConfiguration.clusterConfiguration(clusterProps(), null, null);
            assertEquals(3, cfg.getClusterNodes().size());
            assertTrue(
                    cfg.getClusterNodes().stream()
                            .anyMatch(
                                    n ->
                                            "valkey-3".equals(n.getHost())
                                                    && Integer.valueOf(6381).equals(n.getPort())));
        }

        @Test
        @DisplayName("maxRedirects is carried through")
        void maxRedirectsIsCarried() {
            Valkey v = clusterProps();
            v.setMaxRedirects(7);
            assertEquals(
                    Integer.valueOf(7),
                    ValkeyConnectionConfiguration.clusterConfiguration(v, null, null)
                            .getMaxRedirects());
        }

        @Test
        @DisplayName("explicit credentials land on the cluster configuration")
        void credentialsAreApplied() {
            RedisClusterConfiguration cfg =
                    ValkeyConnectionConfiguration.clusterConfiguration(
                            clusterProps(), "alice", "s3cret");
            assertEquals("alice", cfg.getUsername());
            assertEquals("s3cret", passwordOf(cfg.getPassword()));
        }
    }

    @Nested
    @DisplayName("resolveClientName()")
    class ResolveClientName {

        @Test
        @DisplayName("blank clientName falls back to stirling-<nodeId>")
        void blankFallsBackToNodeId() {
            Cluster cluster = new ApplicationProperties().getCluster();
            cluster.getNode().setId("node-7");
            assertEquals(
                    "stirling-node-7", ValkeyConnectionConfiguration.resolveClientName(cluster));
        }

        @Test
        @DisplayName("blank clientName with no node id resolves to the stable node name")
        void blankUsesResolvedNodeNameWhenNodeIdGenerated() {
            Cluster cluster = new ApplicationProperties().getCluster();
            assertEquals(
                    "stirling-" + cluster.resolvedNodeName(),
                    ValkeyConnectionConfiguration.resolveClientName(cluster));
        }

        @Test
        @DisplayName("the default clientName survives a restart when a hostname is resolvable")
        void blankNameIsStableAcrossInstances() {
            // Separate Cluster instances stand in for two boots of the same machine.
            Cluster first = new ApplicationProperties().getCluster();
            Cluster second = new ApplicationProperties().getCluster();
            assumeTrue(
                    !first.resolvedNodeName().equals(first.resolvedNodeId()),
                    "no hostname available, so the name legitimately falls back to a fresh UUID");
            assertEquals(
                    ValkeyConnectionConfiguration.resolveClientName(first),
                    ValkeyConnectionConfiguration.resolveClientName(second),
                    "CLIENT LIST name must not churn on restart, or per-node monitoring breaks");
        }

        @Test
        @DisplayName("an explicit clientName is used verbatim and trimmed")
        void explicitNameIsUsedAndTrimmed() {
            Cluster cluster = new ApplicationProperties().getCluster();
            cluster.getNode().setId("node-7");
            cluster.getValkey().setClientName("  stirling-web-a  ");
            assertEquals(
                    "stirling-web-a", ValkeyConnectionConfiguration.resolveClientName(cluster));
        }

        @Test
        @DisplayName("off/none/disabled opt out of CLIENT SETNAME entirely")
        void optOutValuesReturnNull() {
            for (String optOut : List.of("off", "none", "disabled", "OFF", "  None  ")) {
                Cluster cluster = new ApplicationProperties().getCluster();
                cluster.getValkey().setClientName(optOut);
                assertNull(
                        ValkeyConnectionConfiguration.resolveClientName(cluster),
                        "'" + optOut + "' must send no CLIENT SETNAME at all");
            }
        }

        @Test
        @DisplayName("a node id Valkey would reject in HELLO is sanitised, not passed through")
        void unsafeNodeIdIsSanitised() {
            // Valkey answers -ERR to a name with spaces and aborts the RESP3 handshake, so an
            // unsanitised name refuses every connection against a healthy server.
            Cluster cluster = new ApplicationProperties().getCluster();
            cluster.getNode().setId("node 7\nweb\ttab");
            assertEquals(
                    "stirling-node-7-web-tab",
                    ValkeyConnectionConfiguration.resolveClientName(cluster));
        }

        @Test
        @DisplayName("an explicit clientName is sanitised the same way")
        void unsafeExplicitNameIsSanitised() {
            Cluster cluster = new ApplicationProperties().getCluster();
            cluster.getValkey().setClientName("stirling web a");
            assertEquals(
                    "stirling-web-a", ValkeyConnectionConfiguration.resolveClientName(cluster));
        }

        @Test
        @DisplayName("a safe name is returned byte-identical")
        void safeNameIsUntouched() {
            Cluster cluster = new ApplicationProperties().getCluster();
            cluster.getValkey().setClientName("stirling-web_a.1:2");
            assertEquals(
                    "stirling-web_a.1:2", ValkeyConnectionConfiguration.resolveClientName(cluster));
        }
    }

    @Nested
    @DisplayName("guardIgnoredUrl()")
    class GuardIgnoredUrl {

        private Valkey withUrl(String url) {
            Valkey v = new Valkey();
            v.setUrl(url);
            return v;
        }

        @Test
        @DisplayName(
                "a rediss:// url ignored by sentinel mode refuses boot rather than downgrading")
        void redissIgnoredWithoutTlsThrows() {
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () ->
                                    ValkeyConnectionConfiguration.guardIgnoredUrl(
                                            withUrl("rediss://valkey:6379"),
                                            ValkeyMode.SENTINEL,
                                            false));
            assertTrue(
                    ex.getMessage().contains("rediss://"),
                    "the operator must be told which setting silently dropped TLS");
        }

        @Test
        @DisplayName("the same url is allowed once tls.enabled restores TLS")
        void redissIgnoredWithTlsIsAllowed() {
            ValkeyConnectionConfiguration.guardIgnoredUrl(
                    withUrl("rediss://valkey:6379"), ValkeyMode.CLUSTER, true);
        }

        @Test
        @DisplayName("standalone reads the url, so it is never guarded")
        void standaloneIsNeverGuarded() {
            ValkeyConnectionConfiguration.guardIgnoredUrl(
                    withUrl("rediss://valkey:6379"), ValkeyMode.STANDALONE, false);
        }

        @Test
        @DisplayName("a plaintext url carrying credentials warns but still boots")
        void userInfoOnlyWarns() {
            ValkeyConnectionConfiguration.guardIgnoredUrl(
                    withUrl("redis://user:pw@valkey:6379"), ValkeyMode.SENTINEL, false);
        }

        @Test
        @DisplayName("an unparseable ignored url warns rather than failing boot")
        void malformedUrlDoesNotThrow() {
            ValkeyConnectionConfiguration.guardIgnoredUrl(
                    withUrl("redis://valkey:6379 with spaces"), ValkeyMode.CLUSTER, false);
        }

        @Test
        @DisplayName("a blank url is nothing to guard")
        void blankUrlIsIgnored() {
            ValkeyConnectionConfiguration.guardIgnoredUrl(withUrl(""), ValkeyMode.CLUSTER, false);
        }
    }

    @Nested
    @DisplayName("describeTarget()")
    class DescribeTarget {

        @Test
        @DisplayName("standalone describes host:port")
        void standalone() {
            assertEquals(
                    "valkey:6379",
                    ValkeyConnectionConfiguration.describeTarget(
                            ValkeyMode.STANDALONE,
                            new Endpoint("valkey", 6379, false, null, null),
                            new Valkey()));
        }

        @Test
        @DisplayName("sentinel describes the sentinels and the master, never a password")
        void sentinel() {
            Valkey v = new Valkey();
            v.getSentinel().setMaster("mymaster");
            v.getSentinel().setNodes(List.of("sentinel-1:26379", "sentinel-2:26379"));
            v.getSentinel().setPassword("sentinel-pw");
            v.setPassword("data-pw");
            String target =
                    ValkeyConnectionConfiguration.describeTarget(ValkeyMode.SENTINEL, null, v);
            assertTrue(target.contains("sentinel-1:26379"));
            assertTrue(target.contains("mymaster"));
            assertFalse(target.contains("sentinel-pw"), "secrets must never reach a log line");
            assertFalse(target.contains("data-pw"), "secrets must never reach a log line");
        }

        @Test
        @DisplayName("cluster describes the seed nodes, never a password")
        void cluster() {
            Valkey v = new Valkey();
            v.setNodes(List.of("valkey-1:6379", "valkey-2:6379"));
            v.setPassword("data-pw");
            String target =
                    ValkeyConnectionConfiguration.describeTarget(ValkeyMode.CLUSTER, null, v);
            assertTrue(target.contains("valkey-1:6379"));
            assertTrue(target.contains("valkey-2:6379"));
            assertFalse(target.contains("data-pw"), "secrets must never reach a log line");
        }
    }

    // Reflection: the bean method that applies this precedence needs a live server.
    @Nested
    @DisplayName("credential precedence (cluster.valkey.* over url userinfo)")
    class CredentialPrecedence {

        private String firstNonBlank(String preferred, String fallback) throws Exception {
            Method m =
                    ValkeyConnectionConfiguration.class.getDeclaredMethod(
                            "firstNonBlank", String.class, String.class);
            m.setAccessible(true);
            return (String) m.invoke(null, preferred, fallback);
        }

        @Test
        @DisplayName("an explicit property overrides the url userinfo")
        void explicitPropertyWins() throws Exception {
            assertEquals("explicit", firstNonBlank("explicit", "from-url"));
        }

        @Test
        @DisplayName("a blank property falls back to the url userinfo (backward compatibility)")
        void blankPropertyFallsBackToUrl() throws Exception {
            assertEquals("from-url", firstNonBlank("", "from-url"));
            assertEquals("from-url", firstNonBlank(null, "from-url"));
            assertEquals("from-url", firstNonBlank("   ", "from-url"));
        }

        @Test
        @DisplayName("neither set yields null, so no AUTH is attempted")
        void neitherSetYieldsNull() throws Exception {
            assertNull(firstNonBlank("", null));
            assertNull(firstNonBlank(null, "  "));
        }
    }

    private static String passwordOf(RedisPassword pw) {
        return pw.map(String::new).orElse(null);
    }

    @Nested
    @DisplayName("parseUrl()")
    class ParseUrl {

        @Test
        @DisplayName("host + explicit port, no auth, no TLS")
        void hostAndPort() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://valkey.internal:6380");
            assertEquals("valkey.internal", e.host());
            assertEquals(6380, e.port());
            assertFalse(e.tls());
            assertNull(e.username());
            assertNull(e.password());
        }

        @Test
        @DisplayName("missing port defaults to 6379")
        void defaultPort() {
            assertEquals(6379, ValkeyConnectionConfiguration.parseUrl("redis://host").port());
        }

        @Test
        @DisplayName("rediss:// scheme selects TLS")
        void redissSelectsTls() {
            assertTrue(ValkeyConnectionConfiguration.parseUrl("rediss://host:6379").tls());
        }

        @Test
        @DisplayName("user:password@ sets both credentials")
        void userAndPassword() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://alice:s3cret@host");
            assertEquals("alice", e.username());
            assertEquals("s3cret", e.password());
        }

        @Test
        @DisplayName("empty user (:pw@) is password-only auth, username stays null")
        void passwordOnlyEmptyUser() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://:s3cret@host");
            assertNull(e.username(), "empty user must NOT become an empty-string username");
            assertEquals("s3cret", e.password());
        }

        @Test
        @DisplayName("single userinfo token (no colon) is treated as the password")
        void passwordOnlyNoColon() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://s3cret@host");
            assertNull(e.username());
            assertEquals("s3cret", e.password());
        }

        @Test
        @DisplayName("only the first colon splits user/password (colons allowed in password)")
        void colonInPassword() {
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://user:pa:ss:word@host");
            assertEquals("user", e.username());
            assertEquals("pa:ss:word", e.password());
        }

        @Test
        @DisplayName("percent-encoded reserved chars are decoded in the password")
        void percentEncodedPassword() {
            // %40 -> '@', %23 -> '#': both must be encoded or URI parses them structurally.
            Endpoint e = ValkeyConnectionConfiguration.parseUrl("redis://:p%40ss%23word@host");
            assertNull(e.username());
            assertEquals("p@ss#word", e.password());
        }

        @Test
        @DisplayName("blank url throws with a backplane-config message")
        void blankUrlThrows() {
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> ValkeyConnectionConfiguration.parseUrl("   "));
            assertTrue(ex.getMessage().contains("cluster.valkey.url must be set"));
        }

        @Test
        @DisplayName("null url throws")
        void nullUrlThrows() {
            assertThrows(
                    IllegalStateException.class,
                    () -> ValkeyConnectionConfiguration.parseUrl(null));
        }

        @Test
        @DisplayName("url with no host throws a clear error (scheme-less host:port pitfall)")
        void noHostThrows() {
            // "localhost:6379" parses 'localhost' as the scheme, leaving no authority/host.
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> ValkeyConnectionConfiguration.parseUrl("localhost:6379"));
            assertTrue(
                    ex.getMessage().contains("has no host"),
                    "message must name the missing host; got: " + ex.getMessage());
        }

        @Test
        @DisplayName("non-numeric port yields no host (URI registry-authority fallback)")
        void nonNumericPortHasNoHost() {
            // java.net.URI does not throw on a bad port; it falls back to registry authority and
            // reports host=null, so this must surface as the clear no-host error, not a NPE later.
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> ValkeyConnectionConfiguration.parseUrl("redis://host:notaport"));
            assertTrue(ex.getMessage().contains("has no host"));
        }

        @Test
        @DisplayName("syntactically invalid uri throws with the offending url")
        void invalidUriThrows() {
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> ValkeyConnectionConfiguration.parseUrl("redis://ho st:6379"));
            assertTrue(ex.getMessage().contains("not a valid URI"));
            assertTrue(ex.getMessage().contains("redis://ho st:6379"));
        }
    }
}
