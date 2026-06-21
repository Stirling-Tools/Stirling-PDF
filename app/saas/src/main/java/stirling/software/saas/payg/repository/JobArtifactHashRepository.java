package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.job.JobArtifactHash;
import stirling.software.saas.payg.job.JobArtifactHash.JobArtifactHashId;
import stirling.software.saas.payg.lineage.LineageMatch;
import stirling.software.saas.payg.model.JobStatus;

@Repository
public interface JobArtifactHashRepository
        extends JpaRepository<JobArtifactHash, JobArtifactHashId> {

    /**
     * Lineage lookup: find open jobs (owned by {@code userId}, {@code last_step_at > since}) whose
     * recorded artifacts include any of the supplied storage-form signature keys. Ordered by job
     * activity recency. Caller passes {@link Limit#of(int)} to bound the result set — for the
     * single-match hot path use {@code Limit.of(1)} so the DB doesn't materialise unwanted rows.
     */
    @Query(
            "SELECT new stirling.software.saas.payg.lineage.LineageMatch("
                    + " h.id.jobId, h.id.kind, j.lastStepAt)"
                    + " FROM JobArtifactHash h"
                    + " JOIN ProcessingJob j ON j.id = h.id.jobId"
                    + " WHERE j.ownerUserId = :userId"
                    + " AND j.status = :openStatus"
                    + " AND j.lastStepAt > :since"
                    + " AND h.id.contentHash IN :signatures"
                    + " ORDER BY j.lastStepAt DESC")
    List<LineageMatch> findOpenJobsForSignatures(
            @Param("userId") Long userId,
            @Param("openStatus") JobStatus openStatus,
            @Param("since") LocalDateTime since,
            @Param("signatures") Collection<String> signatures,
            Limit limit);

    /** Prunes rows older than {@code cutoff}; run from a scheduled task. */
    @Modifying
    @Query("DELETE FROM JobArtifactHash h WHERE h.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
}
