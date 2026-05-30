package stirling.software.common.cluster.inprocess;

import java.time.Duration;
import java.util.Collection;
import java.util.Collections;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import stirling.software.common.cluster.ClusterNode;
import stirling.software.common.cluster.InstanceRegistry;

public class InProcessInstanceRegistry implements InstanceRegistry {

    private final AtomicReference<ClusterNode> self = new AtomicReference<>();

    @Override
    public void register(ClusterNode node, Duration heartbeatTtl) {
        self.set(node);
    }

    @Override
    public Optional<ClusterNode> lookup(String nodeId) {
        ClusterNode current = self.get();
        return current != null && current.nodeId().equals(nodeId)
                ? Optional.of(current)
                : Optional.empty();
    }

    @Override
    public Collection<ClusterNode> activeNodes() {
        ClusterNode current = self.get();
        return current == null ? Collections.emptyList() : Collections.singletonList(current);
    }

    @Override
    public void deregister(String nodeId) {
        ClusterNode current = self.get();
        if (current != null && current.nodeId().equals(nodeId)) {
            self.set(null);
        }
    }
}
