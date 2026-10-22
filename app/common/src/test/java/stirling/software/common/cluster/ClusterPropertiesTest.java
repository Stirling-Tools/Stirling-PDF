package stirling.software.common.cluster;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;
import stirling.software.common.model.ApplicationProperties.Cluster.Valkey;
import stirling.software.common.model.ApplicationProperties.Cluster.Valkey.ValkeyMode;

class ClusterPropertiesTest {

    @Test
    void defaultsAreDisabledAndInprocess() {
        Cluster props = new ApplicationProperties().getCluster();
        assertFalse(props.isEnabled());
        assertEquals("inprocess", props.getBackplane());
        assertEquals("local", props.getArtifactStore());
        assertEquals(Cluster.NodeRole.BOTH, props.resolvedRole());
        assertEquals("", props.getValkey().getUrl());
        assertFalse(props.getValkey().getTls().isSkipCertVerification());
        assertEquals("both", props.getNode().getRole());
        assertEquals("http", props.getNode().getScheme());
        assertEquals(5000L, props.getNode().getHeartbeatIntervalMs());
    }

    // A drifted default here is a silent breaking change for existing url-only installs.
    @Test
    @DisplayName("new valkey topology + pool keys default to the backward-compatible values")
    void valkeyTopologyAndPoolDefaults() {
        Valkey valkey = new ApplicationProperties().getCluster().getValkey();

        assertEquals("", valkey.getMode(), "blank mode must auto-resolve, not force a topology");
        assertEquals("", valkey.getUsername());
        assertEquals("", valkey.getPassword());
        assertTrue(valkey.getNodes().isEmpty());
        assertEquals(3, valkey.getMaxRedirects());
        assertEquals(30000L, valkey.getTopologyRefreshMs());
        assertEquals("", valkey.getClientName());
        assertEquals(2000L, valkey.getCommandTimeoutMs());

        assertEquals("", valkey.getSentinel().getMaster());
        assertTrue(valkey.getSentinel().getNodes().isEmpty());
        assertEquals("", valkey.getSentinel().getUsername());
        assertEquals("", valkey.getSentinel().getPassword());

        assertFalse(valkey.getTls().isEnabled());
        assertFalse(valkey.getTls().isSkipCertVerification());

        assertTrue(valkey.getPool().isEnabled(), "pooling is on by default");
        assertEquals(16, valkey.getPool().getMaxActive());
        assertEquals(16, valkey.getPool().getMaxIdle());
        // 0, not a warm floor: backplane traffic runs on the shared native connection.
        assertEquals(0, valkey.getPool().getMinIdle());
        assertEquals(2000L, valkey.getPool().getMaxWaitMillis());
        assertEquals(30000L, valkey.getPool().getTimeBetweenEvictionRunsMillis());
        assertTrue(valkey.getPool().isTestOnBorrow());
    }

    @Test
    void resolvedRoleParsesCaseInsensitively() {
        Cluster props = new ApplicationProperties().getCluster();
        props.getNode().setRole("WEB");
        assertEquals(Cluster.NodeRole.WEB, props.resolvedRole());

        props.getNode().setRole("web");
        assertEquals(Cluster.NodeRole.WEB, props.resolvedRole());

        props.getNode().setRole("Worker");
        assertEquals(Cluster.NodeRole.WORKER, props.resolvedRole());

        props.getNode().setRole("garbage");
        assertEquals(Cluster.NodeRole.BOTH, props.resolvedRole());

        props.getNode().setRole(null);
        assertEquals(Cluster.NodeRole.BOTH, props.resolvedRole());
    }

    @Test
    void resolvedNodeIdIsStableAcrossCalls() {
        Cluster props = new ApplicationProperties().getCluster();
        String first = props.resolvedNodeId();
        String second = props.resolvedNodeId();
        assertNotNull(first);
        assertEquals(first, second);
    }

    @Test
    void resolvedNodeIdHonoursExplicitId() {
        Cluster props = new ApplicationProperties().getCluster();
        props.getNode().setId("abc");
        assertEquals("abc", props.resolvedNodeId());
    }

    @Nested
    @DisplayName("Valkey.resolvedMode()")
    class ResolvedMode {

        private Valkey valkey() {
            return new ApplicationProperties().getCluster().getValkey();
        }

        @Test
        @DisplayName("blank mode with nothing else configured is STANDALONE (url-only upgrade)")
        void blankDefaultsToStandalone() {
            Valkey v = valkey();
            v.setUrl("redis://valkey:6379");
            assertEquals(ValkeyMode.STANDALONE, v.resolvedMode());
        }

        @Test
        @DisplayName("blank mode + sentinel.master infers SENTINEL")
        void blankWithSentinelMasterInfersSentinel() {
            Valkey v = valkey();
            v.getSentinel().setMaster("mymaster");
            assertEquals(ValkeyMode.SENTINEL, v.resolvedMode());
        }

        @Test
        @DisplayName("blank mode + nodes infers CLUSTER")
        void blankWithNodesInfersCluster() {
            Valkey v = valkey();
            v.setNodes(List.of("valkey-1:6379"));
            assertEquals(ValkeyMode.CLUSTER, v.resolvedMode());
        }

        @Test
        @DisplayName("blank mode + BOTH sentinel.master and nodes is ambiguous and throws")
        void blankWithBothIsAmbiguous() {
            Valkey v = valkey();
            v.getSentinel().setMaster("mymaster");
            v.setNodes(List.of("valkey-1:6379"));
            IllegalStateException ex = assertThrows(IllegalStateException.class, v::resolvedMode);
            assertTrue(
                    ex.getMessage().contains("Set cluster.valkey.mode explicitly"),
                    "message must tell the operator how to disambiguate; got: " + ex.getMessage());
        }

        @Test
        @DisplayName("explicit mode parses case-insensitively and trims surrounding whitespace")
        void explicitModeParsingIsLenient() {
            Valkey v = valkey();
            v.setMode("SENTINEL");
            assertEquals(ValkeyMode.SENTINEL, v.resolvedMode());
            v.setMode(" sentinel ");
            assertEquals(ValkeyMode.SENTINEL, v.resolvedMode());
            v.setMode("Cluster");
            assertEquals(ValkeyMode.CLUSTER, v.resolvedMode());
            v.setMode("standalone");
            assertEquals(ValkeyMode.STANDALONE, v.resolvedMode());
        }

        @Test
        @DisplayName("unknown mode names the bad value and lists the valid ones")
        void unknownModeThrows() {
            Valkey v = valkey();
            v.setMode("clustr");
            IllegalStateException ex = assertThrows(IllegalStateException.class, v::resolvedMode);
            assertTrue(ex.getMessage().contains("clustr"), "must echo the bad value");
            assertTrue(
                    ex.getMessage().contains("standalone | sentinel | cluster"),
                    "must list valid values; got: " + ex.getMessage());
        }

        @Test
        @DisplayName("explicit mode wins over inference (standalone even when nodes are set)")
        void explicitModeWinsOverInference() {
            Valkey v = valkey();
            v.setNodes(List.of("valkey-1:6379"));
            v.setMode("standalone");
            assertEquals(ValkeyMode.STANDALONE, v.resolvedMode());
        }
    }

    /** A bare 'valkey:'/'sentinel:'/'tls:'/'pool:'/'nodes:' key in settings.yml binds null. */
    @Nested
    @DisplayName("bare yaml keys bind null")
    class BareYamlKeys {

        @Test
        @DisplayName("a null nested block is re-seeded with its defaults, never handed back")
        void nullNestedBlocksAreReSeeded() {
            Cluster cluster = new ApplicationProperties().getCluster();
            cluster.setValkey(null);
            Valkey valkey = cluster.getValkey();
            assertNotNull(valkey);

            valkey.setSentinel(null);
            valkey.setTls(null);
            valkey.setPool(null);
            valkey.setNodes(null);
            assertNotNull(valkey.getSentinel());
            assertNotNull(valkey.getTls());
            assertNotNull(valkey.getPool());
            assertEquals(16, valkey.getPool().getMaxActive());
            assertTrue(valkey.getNodes().isEmpty());

            valkey.getSentinel().setNodes(null);
            assertTrue(valkey.getSentinel().getNodes().isEmpty());
        }

        @Test
        @DisplayName("resolvedMode() survives null sentinel and nodes blocks")
        void resolvedModeSurvivesNullBlocks() {
            Valkey valkey = new ApplicationProperties().getCluster().getValkey();
            valkey.setSentinel(null);
            valkey.setNodes(null);
            assertEquals(ValkeyMode.STANDALONE, valkey.resolvedMode());
        }
    }
}
