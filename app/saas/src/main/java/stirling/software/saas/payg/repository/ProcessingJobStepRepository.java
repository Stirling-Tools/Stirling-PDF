package stirling.software.saas.payg.repository;

import java.util.List;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.job.ProcessingJobStep;

@ApplicationScoped
public class ProcessingJobStepRepository implements PanacheRepositoryBase<ProcessingJobStep, Long> {

    public List<ProcessingJobStep> findByJobIdOrderByStartedAtAsc(UUID jobId) {
        return find("jobId = ?1 ORDER BY startedAt ASC", jobId).list();
    }
}
