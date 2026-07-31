package stirling.software.proprietary.policy.migration;

import org.springframework.data.jpa.repository.JpaRepository;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public interface CompletedMigrationRepository extends JpaRepository<CompletedMigration, String> {}
