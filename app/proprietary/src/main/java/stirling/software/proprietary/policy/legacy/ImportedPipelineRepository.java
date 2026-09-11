package stirling.software.proprietary.policy.legacy;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ImportedPipelineRepository extends JpaRepository<ImportedPipeline, String> {}
