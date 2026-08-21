package stirling.software.common.cluster;

import java.time.Duration;
import java.util.Collection;
import java.util.Optional;

/** Maps {@code nodeId} to its internal cluster address, with TTL'd heartbeats. */
public interface InstanceRegistry {

    /** Register or refresh this node. Idempotent so a wiped backplane self-heals on next tick. */
    void register(ClusterNode node, Duration heartbeatTtl);

    Optional<ClusterNode> lookup(String nodeId);

    Collection<ClusterNode> activeNodes();

    void deregister(String nodeId);
}
