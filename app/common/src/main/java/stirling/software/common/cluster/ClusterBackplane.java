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
     * Whether this JVM should run the local {@link
     * stirling.software.common.service.TaskManager#cleanupOldJobs()} loop. Distributed backplanes
     * own job expiry via their own TTL, so they should override this to return {@code false}.
     * Defaults to {@code true} so in-process behavior is preserved without an explicit override.
     */
    default boolean shouldRunLocalCleanup() {
        return true;
    }
}
