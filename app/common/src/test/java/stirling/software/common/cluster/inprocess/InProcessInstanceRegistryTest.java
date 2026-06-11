package stirling.software.common.cluster.inprocess;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import stirling.software.common.cluster.ClusterNode;

class InProcessInstanceRegistryTest {

    @Test
    void registerThenLookupAndActiveNodes() {
        InProcessInstanceRegistry registry = new InProcessInstanceRegistry();
        ClusterNode node = new ClusterNode("node-1", "127.0.0.1:8080", Instant.now(), "BOTH");
        registry.register(node, Duration.ofSeconds(30));

        assertTrue(registry.lookup("node-1").isPresent());
        assertEquals("node-1", registry.lookup("node-1").get().nodeId());
        assertEquals(1, registry.activeNodes().size());

        registry.deregister("node-1");
        assertTrue(registry.lookup("node-1").isEmpty());
    }
}
