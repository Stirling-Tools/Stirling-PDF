package stirling.software.proprietary.policy.migration;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CompletedMigrationRepository extends JpaRepository<CompletedMigration, String> {}
