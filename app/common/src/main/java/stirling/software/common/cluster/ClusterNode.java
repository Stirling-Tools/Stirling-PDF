package stirling.software.common.cluster;

import java.time.Instant;

/**
 * Snapshot of a peer node as recorded in the {@link InstanceRegistry}.
 *
 * @param internalAddress {@code host:port} the node listens on for {@code /internal/cluster/**}
 * @param role one of {@code WEB}, {@code WORKER}, {@code BOTH}
 */
public record ClusterNode(
        String nodeId, String internalAddress, Instant lastHeartbeat, String role) {}
