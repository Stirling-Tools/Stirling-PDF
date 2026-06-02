package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.job.JobArtifactHash;
import stirling.software.saas.payg.job.JobArtifactHash.JobArtifactHashId;
import stirling.software.saas.payg.model.JobStatus;

@Repository
public interface JobArtifactHashRepository
        extends JpaRepository<JobArtifactHash, JobArtifactHashId> {

    /**
     * Lineage lookup: find the open job (if any) whose recorded input/output hashes include the
     * supplied content hash, scoped to one user and the workflow window.
     */
    @Query(
            "SELECT j.ownerUserId, h.id.jobId FROM JobArtifactHash h"
                    + " JOIN ProcessingJob j ON j.id = h.id.jobId"
                    + " WHERE j.ownerUserId = :userId"
                    + " AND j.status = :openStatus"
                    + " AND j.lastStepAt > :since"
                    + " AND h.id.contentHash = :contentHash")
    List<Object[]> findLineageMatches(
            @Param("userId") Long userId,
            @Param("openStatus") JobStatus openStatus,
            @Param("since") LocalDateTime since,
            @Param("contentHash") String contentHash);

    /** Prunes rows older than {@code cutoff}; run from a scheduled task. */
    @Modifying
    @Query("DELETE FROM JobArtifactHash h WHERE h.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
}
