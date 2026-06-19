package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.job.ProcessingJob;
import stirling.software.saas.payg.model.JobStatus;

@ApplicationScoped
public class ProcessingJobRepository implements PanacheRepositoryBase<ProcessingJob, UUID> {

    public List<ProcessingJob> findByOwnerUserIdAndStatus(Long ownerUserId, JobStatus status) {
        return find("ownerUserId = ?1 and status = ?2", ownerUserId, status).list();
    }

    /** Jobs left OPEN past the workflow window; the stale-close scheduler picks these up. */
    public List<ProcessingJob> findStale(JobStatus status, LocalDateTime cutoff) {
        return find("status = ?1 and lastStepAt < ?2", status, cutoff).list();
    }

    // Spring-Data save() shim: persist when new, merge when detached.
    public ProcessingJob save(ProcessingJob entity) {
        if (entity.getId() == null) {
            persist(entity);
            return entity;
        }
        return getEntityManager().merge(entity);
    }
}
