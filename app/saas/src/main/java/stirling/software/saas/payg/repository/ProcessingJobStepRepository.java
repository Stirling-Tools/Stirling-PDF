package stirling.software.saas.payg.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.saas.payg.job.ProcessingJobStep;

public interface ProcessingJobStepRepository extends JpaRepository<ProcessingJobStep, Long> {

    List<ProcessingJobStep> findByJobIdOrderByStartedAtAsc(UUID jobId);
}
