package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.saas.payg.instance.PaygInstanceUsage;

/** Last-seen cumulative usage per (team, period, category) for linked-instance daily syncs. */
public interface PaygInstanceUsageRepository extends JpaRepository<PaygInstanceUsage, Long> {

    Optional<PaygInstanceUsage> findByTeamIdAndPeriodStartAndCategory(
            Long teamId, LocalDateTime periodStart, String category);
}
