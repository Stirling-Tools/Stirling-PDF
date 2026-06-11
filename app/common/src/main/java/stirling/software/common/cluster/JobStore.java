package stirling.software.common.cluster;

import java.time.Duration;
import java.util.Collection;
import java.util.Optional;

/** Cluster-visible storage for job status and result metadata, with TTL'd entries. */
public interface JobStore {

    /** Persist or overwrite a job entry. {@code ttl} sets the lifetime of the entry. */
    void put(JobStoreEntry entry, Duration ttl);

    Optional<JobStoreEntry> get(String jobId);

    void delete(String jobId);

    boolean exists(String jobId);

    /** Reverse lookup: which job owns this result file id? */
    Optional<String> findJobIdByFileId(String fileId);

    /** Snapshot of every active entry. Used by admin/stats endpoints; may be O(n). */
    Collection<JobStoreEntry> all();
}
