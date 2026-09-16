package stirling.software.common.cluster;

/** Health and identity facade for the active cluster backplane. */
public interface ClusterBackplane {

    /** Returns {@code true} when the backplane is reachable; used for health endpoints. */
    boolean isHealthy();

    /** Returns {@code "inprocess"} or {@code "valkey"}. */
    String backplaneType();

    /** Returns this JVM's stable node id (matches {@code Cluster.resolvedNodeId()}). */
    String localNodeId();

    /**
     * Whether this JVM owns expiry of the <em>shared</em> job row. Distributed backplanes expire it
     * by TTL, so they override this to {@code false} and the local sweep skips the redundant
     * delete. It does NOT disable the sweep itself: reclaiming this node's heap and result files is
     * always local work, and no TTL elsewhere can do it.
     */
    default boolean shouldRunLocalCleanup() {
        return true;
    }
}
