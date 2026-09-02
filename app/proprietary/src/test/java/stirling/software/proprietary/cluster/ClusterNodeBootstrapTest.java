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

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.InstanceRegistry;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.testsupport.ReflectionTestUtils;

/** Verifies the bootstrap registers / heartbeats / deregisters as expected. */
class ClusterNodeBootstrapTest {

    private InstanceRegistry registry;
    private ApplicationProperties props;
    private ClusterNodeBootstrap bootstrap;

    /**
     * In production {@code @PostConstruct init()} computes {@code heartbeatTtl} and the {@code
     * cluster.enabled} / {@code server.port} {@code @ConfigProperty} fields are injected by
     * Quarkus. Under a plain unit test none of that runs, so we invoke {@code init()} reflectively
     * and seed the config fields directly. Startup is driven by calling {@code
     * registerOnStartup(null)} - the {@code @Observes StartupEvent} argument is unused by the
     * method body.
     */
    private static ClusterNodeBootstrap newBootstrap(
            ApplicationProperties props, InstanceRegistry registry, int port) {
        ClusterNodeBootstrap b = new ClusterNodeBootstrap(props, registry);
        ReflectionTestUtils.setField(b, "clusterEnabled", true);
        ReflectionTestUtils.setField(b, "serverPort", port);
        invokeInit(b);
        return b;
    }

    /**
     * Invoke the package-private {@code @PostConstruct init()} that computes {@code heartbeatTtl}.
     */
    private static void invokeInit(ClusterNodeBootstrap b) {
        try {
            var init = ClusterNodeBootstrap.class.getDeclaredMethod("init");
            init.setAccessible(true);
            init.invoke(b);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to invoke ClusterNodeBootstrap.init()", e);
        }
    }

    @BeforeEach
    void setUp() {
        registry = mock(InstanceRegistry.class);
        props = new ApplicationProperties();
        props.getCluster().setEnabled(true);
        props.getCluster().getNode().setId("node-test-1");
        props.getCluster().getNode().setRole("worker");
        props.getCluster().getNode().setHeartbeatIntervalMs(10_000L);
        bootstrap = newBootstrap(props, registry, 8080);
    }

    @Test
    void registerOnStartupCallsRegistryWithResolvedNodeId() {
        bootstrap.registerOnStartup(null);
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
        bootstrap.registerOnStartup(null);
        ArgumentCaptor<ClusterNode> nodeCaptor = ArgumentCaptor.forClass(ClusterNode.class);
        verify(registry).register(nodeCaptor.capture(), any());
        assertEquals("http://app-1:8080", nodeCaptor.getValue().internalAddress());
    }

    @Test
    void registerUsesHttpsSchemeWhenConfigured() {
        props.getCluster().getNode().setInternalAddress("app-1:8443");
        props.getCluster().getNode().setScheme("https");
        ClusterNodeBootstrap httpsBootstrap = newBootstrap(props, registry, 8443);
        httpsBootstrap.registerOnStartup(null);
        ArgumentCaptor<ClusterNode> nodeCaptor = ArgumentCaptor.forClass(ClusterNode.class);
        verify(registry).register(nodeCaptor.capture(), any());
        assertEquals("https://app-1:8443", nodeCaptor.getValue().internalAddress());
    }

    @Test
    void heartbeatAfterStartup_callsRegister_forSelfHealing() {
        bootstrap.registerOnStartup(null);
        bootstrap.heartbeat();
        verify(registry, times(2))
                .register(
                        any(ClusterNode.class),
                        org.mockito.ArgumentMatchers.eq(Duration.ofSeconds(30)));
    }

    @Test
    void smartLifecycleStop_deregisters() {
        bootstrap.registerOnStartup(null);
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
        bootstrap.registerOnStartup(null);
        verify(registry, times(1)).register(any(ClusterNode.class), any(Duration.class));

        bootstrap.stop();
        verify(registry, times(1)).deregister("node-test-1");

        bootstrap.heartbeat();
        verify(registry, times(1)).register(any(ClusterNode.class), any(Duration.class));
    }
}
