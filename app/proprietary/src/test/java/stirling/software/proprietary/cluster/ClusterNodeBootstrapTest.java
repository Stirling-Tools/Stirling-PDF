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
        // Pin heartbeat to 10s so TTL math is stable across PR2 default changes (TTL = 3x = 30s).
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
        // SE3: nodes that terminate TLS themselves need https:// in the registry so peers can reach
        // them. The default (http) is correct for the common LB-terminates-TLS topology.
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
        // Heartbeat re-invokes register() (idempotent) so a wiped backplane re-populates
        // every field, not just lastHeartbeat. Expect 2 register() calls: startup + heartbeat.
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
        // Heartbeat-after-stop race: SmartLifecycle.stop() deregisters, but the @Scheduled
        // tick keeps firing during a slow drain. Without a guard, the next tick would
        // re-register the dead node and the entry would resurface in the registry until TTL
        // expiry. Rolling deploys with slow shutdown = draining nodes keep re-announcing
        // themselves indefinitely.
        bootstrap.start();
        bootstrap.registerOnStartup();
        // 1 register from startup.
        verify(registry, times(1)).register(any(ClusterNode.class), any(Duration.class));

        bootstrap.stop();
        verify(registry, times(1)).deregister("node-test-1");

        // Critical: next scheduled tick after stop must NOT re-register.
        bootstrap.heartbeat();
        // Still exactly 1 register call (the startup one); no second register from heartbeat.
        verify(registry, times(1)).register(any(ClusterNode.class), any(Duration.class));
    }
}
