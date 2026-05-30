package stirling.software.common.cluster;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Cluster;

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
}
