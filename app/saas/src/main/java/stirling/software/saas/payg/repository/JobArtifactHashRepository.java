package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.saas.payg.job.JobArtifactHash;
import stirling.software.saas.payg.job.JobArtifactHash.JobArtifactHashId;
import stirling.software.saas.payg.lineage.LineageMatch;
import stirling.software.saas.payg.model.JobStatus;

@ApplicationScoped
public class JobArtifactHashRepository
        implements PanacheRepositoryBase<JobArtifactHash, JobArtifactHashId> {

    /**
     * Lineage lookup: find open jobs whose recorded artifacts include any of the supplied
     * storage-form signature keys. Ordered by job activity recency. Limit bounds the result set.
     */
    public List<LineageMatch> findOpenJobsForSignatures(
            Long userId,
            JobStatus openStatus,
            LocalDateTime since,
            Collection<String> signatures,
            int limit) {
        return getEntityManager()
                .createQuery(
                        "SELECT new stirling.software.saas.payg.lineage.LineageMatch("
                                + " h.id.jobId, h.id.kind, j.lastStepAt)"
                                + " FROM JobArtifactHash h"
                                + " JOIN ProcessingJob j ON j.id = h.id.jobId"
                                + " WHERE j.ownerUserId = :userId"
                                + " AND j.status = :openStatus"
                                + " AND j.lastStepAt > :since"
                                + " AND h.id.contentHash IN :signatures"
                                + " ORDER BY j.lastStepAt DESC",
                        LineageMatch.class)
                .setParameter("userId", userId)
                .setParameter("openStatus", openStatus)
                .setParameter("since", since)
                .setParameter("signatures", signatures)
                .setMaxResults(limit)
                .getResultList();
    }

    /** Prunes rows older than cutoff; run from a scheduled task. */
    @Transactional
    public int deleteOlderThan(LocalDateTime cutoff) {
        return (int) delete("createdAt < ?1", cutoff);
    }
}
