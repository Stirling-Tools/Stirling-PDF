package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.job.ProcessingJob;
import stirling.software.saas.payg.model.JobStatus;

@Repository
public interface ProcessingJobRepository extends JpaRepository<ProcessingJob, UUID> {

    List<ProcessingJob> findByOwnerUserIdAndStatus(Long ownerUserId, JobStatus status);

    /**
     * Jobs left {@code OPEN} past the workflow window; the stale-close scheduler picks these up.
     */
    @Query("SELECT j FROM ProcessingJob j WHERE j.status = :status AND j.lastStepAt < :cutoff")
    List<ProcessingJob> findStale(
            @Param("status") JobStatus status, @Param("cutoff") LocalDateTime cutoff);
}
