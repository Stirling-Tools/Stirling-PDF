package stirling.software.saas.payg.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.job.ProcessingJobStep;

@Repository
public interface ProcessingJobStepRepository extends JpaRepository<ProcessingJobStep, Long> {

    List<ProcessingJobStep> findByJobIdOrderByStartedAtAsc(UUID jobId);
}
