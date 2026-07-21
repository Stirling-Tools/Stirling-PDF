package stirling.software.proprietary.cluster;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.InstanceRegistry;
import stirling.software.common.model.ApplicationProperties;

/** Verifies the bootstrap registers / heartbeats / deregisters as expected. */
class ClusterNodeBootstrapTest {

    private InstanceRegistry registry;
    private ApplicationProperties props;
    private ClusterNodeBootstrap bootstrap;

    @BeforeEach
    void setUp() {
        registry = mock(InstanceRegistry.class);
        props = new ApplicationProperties();
        props.getCluster().setEnabled(true);
        props.getCluster().getNode().setId("node-test-1");
        props.getCluster().getNode().setRole("worker");
        props.getCluster().getNode().setHeartbeatIntervalMs(10_000L);
        bootstrap = new ClusterNodeBootstrap(props, registry);
        ReflectionTestUtils.setField(bootstrap, "serverPort", 8080);
    }

    @Test
    void registerOnStartupCallsRegistryWithResolvedNodeId() {
        bootstrap.registerOnStartup();
        ArgumentCaptor<ClusterNode> nodeCaptor = ArgumentCaptor.forClass(ClusterNode.class);
        ArgumentCaptor<Duration> ttlCaptor = ArgumentCaptor.forClass(Duration.class);
        verify(registry, times(1)).register(nodeCaptor.capture(), ttlCaptor.capture());
        ClusterNode captured = nodeCaptor.getValue();
        assertEquals("node-test-1", captured.nodeId());
        assertTrue(captured.internalAddress().startsWith("http://"));
        assertTrue(captured.internalAddress().endsWith(":8080"));
        assertEquals("WORKER", captured.role());
        assertEquals(30L, ttlCaptor.getValue().toSeconds());
    }

    @Test
    void registerHonoursExplicitInternalAddress() {
        props.getCluster().getNode().setInternalAddress("app-1:8080");
        bootstrap.registerOnStartup();
        ArgumentCaptor<ClusterNode> nodeCaptor = ArgumentCaptor.forClass(ClusterNode.class);
        verify(registry).register(nodeCaptor.capture(), any());
        assertEquals("http://app-1:8080", nodeCaptor.getValue().internalAddress());
    }

    @Test
    void registerUsesHttpsSchemeWhenConfigured() {
        props.getCluster().getNode().setInternalAddress("app-1:8443");
        props.getCluster().getNode().setScheme("https");
        ClusterNodeBootstrap httpsBootstrap = new ClusterNodeBootstrap(props, registry);
        ReflectionTestUtils.setField(httpsBootstrap, "serverPort", 8443);
        httpsBootstrap.registerOnStartup();
        ArgumentCaptor<ClusterNode> nodeCaptor = ArgumentCaptor.forClass(ClusterNode.class);
        verify(registry).register(nodeCaptor.capture(), any());
        assertEquals("https://app-1:8443", nodeCaptor.getValue().internalAddress());
    }

    @Test
    void heartbeatAfterStartup_callsRegister_forSelfHealing() {
        bootstrap.start();
        bootstrap.registerOnStartup();
        bootstrap.heartbeat();
        verify(registry, times(2))
                .register(
                        any(ClusterNode.class),
                        org.mockito.ArgumentMatchers.eq(Duration.ofSeconds(30)));
    }

    @Test
    void smartLifecycleStop_deregisters() {
        bootstrap.start();
        bootstrap.registerOnStartup();
        bootstrap.stop();
        verify(registry, times(1)).deregister("node-test-1");
    }

    @Test
    void smartLifecycleStop_beforeStartup_isNoop() {
        bootstrap.stop();
        verify(registry, never()).deregister(any());
    }

    @Test
    void heartbeatAfterStop_doesNotReRegister() {
        // Heartbeat-after-stop race: the @Scheduled tick fires during a slow drain. Without
        // a guard it would re-register the dead node until TTL expiry.
        bootstrap.start();
        bootstrap.registerOnStartup();
        verify(registry, times(1)).register(any(ClusterNode.class), any(Duration.class));

        bootstrap.stop();
        verify(registry, times(1)).deregister("node-test-1");

        bootstrap.heartbeat();
        verify(registry, times(1)).register(any(ClusterNode.class), any(Duration.class));
    }
}
