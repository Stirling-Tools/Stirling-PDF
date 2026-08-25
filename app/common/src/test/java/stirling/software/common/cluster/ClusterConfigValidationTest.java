package stirling.software.common.cluster;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Method;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;
import stirling.software.common.model.ApplicationProperties.Cluster.Valkey;

class ClusterConfigValidationTest {

    @Test
    void validationPassesWhenDisabled() {
        ApplicationProperties props = new ApplicationProperties();
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> invokeValidate(config));
    }

    @Test
    void validationFailsWhenValkeyEnabledWithoutUrl() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("valkey");
        ClusterConfig config = new ClusterConfig(props);
        assertThrows(IllegalStateException.class, () -> invokeValidate(config));
    }

    @Test
    @DisplayName("backward compatibility: url only, no new keys, still validates")
    void validationPassesWhenValkeyEnabledWithUrl() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("valkey");
        cluster.getValkey().setUrl("redis://localhost:6379");
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> invokeValidate(config));
    }

    @Test
    void validationPassesWhenInProcessEnabled() {
        ApplicationProperties props = new ApplicationProperties();
        Cluster cluster = props.getCluster();
        cluster.setEnabled(true);
        cluster.setBackplane("inprocess");
        ClusterConfig config = new ClusterConfig(props);
        assertDoesNotThrow(() -> invokeValidate(config));
    }

    /** Rules V1-V13 of the topology spec. Each asserts the exact operator-facing wording. */
    @Nested
    @DisplayName("valkey topology + pool validation")
    class TopologyValidation {

        private ApplicationProperties props;

        @Test
        @DisplayName("V1: unknown mode names the bad value and the valid set")
        void unknownModeRejected() {
            Valkey v = valkeyProps();
            v.setMode("clustr");
            assertMessage("clustr", "standalone | sentinel | cluster");
        }

        @Test
        @DisplayName("V2: blank mode with both sentinel.master and nodes is ambiguous")
        void ambiguousModeRejected() {
            Valkey v = valkeyProps();
            v.getSentinel().setMaster("mymaster");
            v.setNodes(List.of("valkey-1:6379"));
            assertMessage("Set cluster.valkey.mode explicitly");
        }

        @Test
        @DisplayName("V3: standalone without a url keeps the original message (test contract)")
        void standaloneWithoutUrlRejected() {
            valkeyProps();
            assertMessage(
                    "cluster.enabled=true with backplane=valkey requires",
                    "cluster.valkey.url to be set",
                    "redis://valkey:6379");
        }

        @Test
        @DisplayName("V4: sentinel mode without a master name is rejected")
        void sentinelWithoutMasterRejected() {
            Valkey v = valkeyProps();
            v.setMode("sentinel");
            v.getSentinel().setNodes(List.of("sentinel-1:26379"));
            assertMessage("cluster.valkey.sentinel.master to be set", "mymaster");
        }

        @Test
        @DisplayName("V5: sentinel mode without any sentinel endpoints is rejected")
        void sentinelWithoutNodesRejected() {
            Valkey v = valkeyProps();
            v.setMode("sentinel");
            v.getSentinel().setMaster("mymaster");
            assertMessage("cluster.valkey.sentinel.nodes to list at least one sentinel");
        }

        @Test
        @DisplayName("V6: cluster mode without any seed nodes is rejected")
        void clusterWithoutNodesRejected() {
            Valkey v = valkeyProps();
            v.setMode("cluster");
            assertMessage("cluster.valkey.nodes to list at least one seed node");
        }

        @Test
        @DisplayName("V7: a nodes entry that is not host:port is rejected, echoing the entry")
        void clusterNodeEntryMustBeHostPort() {
            Valkey v = valkeyProps();
            v.setMode("cluster");
            v.setNodes(List.of("valkey-1:6379", "valkey-2"));
            assertMessage("cluster.valkey.nodes entry", "valkey-2", "is not host:port");
        }

        @ParameterizedTest
        @ValueSource(strings = {"valkey-1:notaport", "valkey-1:70000", ":6379", "valkey-1:"})
        @DisplayName("V7: a non-numeric or out-of-range port is rejected")
        void clusterNodePortMustBeNumericAndInRange(String entry) {
            Valkey v = valkeyProps();
            v.setMode("cluster");
            v.setNodes(List.of(entry));
            assertMessage(entry, "is not host:port");
        }

        @Test
        @DisplayName("V7: a sentinel.nodes entry that is not host:port is rejected")
        void sentinelNodeEntryMustBeHostPort() {
            Valkey v = valkeyProps();
            v.setMode("sentinel");
            v.getSentinel().setMaster("mymaster");
            v.getSentinel().setNodes(List.of("sentinel-1"));
            assertMessage("cluster.valkey.sentinel.nodes entry", "sentinel-1", "is not host:port");
        }

        @Test
        @DisplayName("V8: pool.maxActive < 2 is rejected (the shared connection holds one)")
        void poolMaxActiveMustLeaveRoomForSharedConnection() {
            Valkey v = validStandalone();
            v.getPool().setMaxActive(1);
            assertMessage("cluster.valkey.pool.maxActive must be >= 2", "got 1");
        }

        @Test
        @DisplayName("V8: maxActive < 2 is allowed when pooling is off (the check is pool-scoped)")
        void poolMaxActiveIgnoredWhenPoolingDisabled() {
            Valkey v = validStandalone();
            v.getPool().setEnabled(false);
            v.getPool().setMaxActive(1);
            assertPasses();
        }

        @Test
        @DisplayName("V9: pool.maxWaitMillis <= 0 is rejected (0 fails borrows, negative blocks)")
        void poolMaxWaitMustBePositive() {
            Valkey v = validStandalone();
            v.getPool().setMaxWaitMillis(0);
            assertMessage("cluster.valkey.pool.maxWaitMillis must be > 0", "got 0");
        }

        @Test
        @DisplayName("V10: commandTimeoutMs <= 0 is rejected")
        void commandTimeoutMustBePositive() {
            Valkey v = validStandalone();
            v.setCommandTimeoutMs(0);
            assertMessage("cluster.valkey.commandTimeoutMs must be > 0", "got 0");
        }

        @Test
        @DisplayName("V11: maxRedirects < 1 is rejected in cluster mode")
        void maxRedirectsMustBeAtLeastOneInClusterMode() {
            Valkey v = valkeyProps();
            v.setMode("cluster");
            v.setNodes(List.of("valkey-1:6379"));
            v.setMaxRedirects(0);
            assertMessage("cluster.valkey.maxRedirects must be >= 1 in cluster mode", "got 0");
        }

        @Test
        @DisplayName("V11: maxRedirects is not checked outside cluster mode")
        void maxRedirectsIgnoredOutsideClusterMode() {
            Valkey v = validStandalone();
            v.setMaxRedirects(0);
            assertPasses();
        }

        @Test
        @DisplayName("V12: a url set alongside sentinel mode is accepted (ignored, not fatal)")
        void urlAlongsideSentinelIsNotFatal() {
            Valkey v = valkeyProps();
            v.setUrl("redis://valkey:6379");
            v.setMode("sentinel");
            v.getSentinel().setMaster("mymaster");
            v.getSentinel().setNodes(List.of("sentinel-1:26379", "sentinel-2:26379"));
            assertPasses();
        }

        @Test
        @DisplayName("V13: data password without a sentinel password warns but still boots")
        void sentinelPasswordMismatchIsOnlyAWarning() {
            Valkey v = valkeyProps();
            v.setMode("sentinel");
            v.setPassword("data-pw");
            v.getSentinel().setMaster("mymaster");
            v.getSentinel().setNodes(List.of("sentinel-1:26379"));
            assertPasses();
        }

        @Test
        @DisplayName("a fully configured sentinel topology validates")
        void validSentinelTopologyPasses() {
            Valkey v = valkeyProps();
            v.setMode("sentinel");
            v.getSentinel().setMaster("mymaster");
            v.getSentinel()
                    .setNodes(List.of("sentinel-1:26379", "sentinel-2:26379", "sentinel-3:26379"));
            v.getSentinel().setPassword("sentinel-pw");
            assertPasses();
        }

        @Test
        @DisplayName("a fully configured cluster topology validates")
        void validClusterTopologyPasses() {
            Valkey v = valkeyProps();
            v.setMode("cluster");
            v.setNodes(List.of("valkey-1:6379", "valkey-2:6379", "valkey-3:6379"));
            assertPasses();
        }

        @Test
        @DisplayName("cluster.enabled=false skips every new check, garbage mode included")
        void disabledClusterSkipsTopologyChecks() {
            valkeyProps().setMode("not-a-mode");
            props.getCluster().setEnabled(false);
            assertPasses();
        }

        /** enabled + backplane=valkey with no topology keys set yet. */
        private Valkey valkeyProps() {
            props = new ApplicationProperties();
            props.getCluster().setEnabled(true);
            props.getCluster().setBackplane("valkey");
            return props.getCluster().getValkey();
        }

        /** The minimal legacy configuration: standalone via url only. */
        private Valkey validStandalone() {
            Valkey v = valkeyProps();
            v.setUrl("redis://valkey:6379");
            return v;
        }

        private void assertPasses() {
            ClusterConfig config = new ClusterConfig(props);
            assertDoesNotThrow(() -> invokeValidate(config));
        }

        private void assertMessage(String... expectedSubstrings) {
            ClusterConfig config = new ClusterConfig(props);
            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, () -> invokeValidate(config));
            for (String expected : expectedSubstrings) {
                assertTrue(
                        ex.getMessage().contains(expected),
                        "message must contain '" + expected + "'; got: " + ex.getMessage());
            }
        }
    }

    /** A bare 'valkey:'/'sentinel:'/'pool:' key binds null; validation must not NPE on it. */
    @Nested
    @DisplayName("null config blocks give the operator message, never an NPE")
    class BareYamlKeys {

        private ApplicationProperties props;

        @Test
        void nullValkeyBlockReportsTheMissingUrl() {
            enabled();
            props.getCluster().setValkey(null);
            assertMessage("cluster.valkey.url");
        }

        @Test
        void nullSentinelBlockReportsTheMissingMaster() {
            Valkey v = enabled();
            v.setMode("sentinel");
            v.setSentinel(null);
            assertMessage("cluster.valkey.sentinel.master");
        }

        @Test
        void nullSentinelNodesReportsTheMissingNodeList() {
            Valkey v = enabled();
            v.setMode("sentinel");
            v.getSentinel().setMaster("mymaster");
            v.getSentinel().setNodes(null);
            assertMessage("cluster.valkey.sentinel.nodes");
        }

        @Test
        void nullNodesBlockReportsTheMissingSeedList() {
            Valkey v = enabled();
            v.setMode("cluster");
            v.setNodes(null);
            assertMessage("cluster.valkey.nodes");
        }

        @Test
        @DisplayName("null pool and tls blocks fall back to defaults and validate")
        void nullPoolAndTlsBlocksValidate() {
            Valkey v = enabled();
            v.setUrl("redis://valkey:6379");
            v.setPool(null);
            v.setTls(null);
            ClusterConfig config = new ClusterConfig(props);
            assertDoesNotThrow(() -> invokeValidate(config));
        }

        private Valkey enabled() {
            props = new ApplicationProperties();
            props.getCluster().setEnabled(true);
            props.getCluster().setBackplane("valkey");
            return props.getCluster().getValkey();
        }

        private void assertMessage(String expected) {
            ClusterConfig config = new ClusterConfig(props);
            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, () -> invokeValidate(config));
            assertTrue(
                    ex.getMessage().contains(expected),
                    "message must contain '" + expected + "'; got: " + ex.getMessage());
        }
    }

    private void invokeValidate(ClusterConfig config) throws Exception {
        Method m = ClusterConfig.class.getDeclaredMethod("validate");
        m.setAccessible(true);
        try {
            m.invoke(config);
        } catch (java.lang.reflect.InvocationTargetException ex) {
            if (ex.getCause() instanceof RuntimeException re) {
                throw re;
            }
            throw ex;
        }
    }
}
