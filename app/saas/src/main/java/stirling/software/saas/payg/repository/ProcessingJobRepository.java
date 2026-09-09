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

    List<ProcessingJob> findByRunIdAndStatus(String runId, JobStatus status);

    /**
     * Jobs left {@code OPEN} past their window; the stale-close scheduler picks these up. A job
     * inside an automation run gets the longer {@code runCutoff}: its run settles it on completion,
     * and one heavy step can outlast the workflow window without the run being over.
     */
    @Query(
            "SELECT j FROM ProcessingJob j WHERE j.status = :status AND ((j.runId IS NULL AND"
                    + " j.lastStepAt < :cutoff) OR (j.runId IS NOT NULL AND j.lastStepAt <"
                    + " :runCutoff))")
    List<ProcessingJob> findStale(
            @Param("status") JobStatus status,
            @Param("cutoff") LocalDateTime cutoff,
            @Param("runCutoff") LocalDateTime runCutoff);
}
