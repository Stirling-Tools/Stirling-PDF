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
     * Whether this JVM owns expiry of the <em>shared</em> job row. Does not disable the local
     * sweep: only that frees this node's heap and result files.
     */
    default boolean shouldRunLocalCleanup() {
        return true;
    }
}
