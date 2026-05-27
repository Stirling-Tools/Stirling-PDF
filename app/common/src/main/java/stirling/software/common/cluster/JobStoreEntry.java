package stirling.software.common.cluster;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Cluster-visible projection of a job's status and result metadata, as persisted in {@link
 * JobStore}.
 *
 * @param owningNodeId the node id that originally executed the job
 */
public record JobStoreEntry(
        String jobId,
        JobState state,
        String owningNodeId,
        Instant createdAt,
        Instant completedAt,
        String error,
        List<String> fileIds,
        Map<String, String> resultMeta) {

    /** Lifecycle states for a job as observed by the cluster. */
    public enum JobState {
        PENDING,
        RUNNING,
        COMPLETE,
        FAILED
    }
}
