package stirling.software.proprietary.repository;

import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import stirling.software.proprietary.model.ToolUsageStat;

/** See {@link ToolUsageStatRepositoryCustom}. */
class ToolUsageStatRepositoryCustomImpl implements ToolUsageStatRepositoryCustom {

    @PersistenceContext private EntityManager entityManager;

    @Override
    @Transactional
    public void insertCount(
            String principal, String fromTool, String toolKey, long epochDay, long delta) {
        entityManager.persist(new ToolUsageStat(principal, fromTool, toolKey, epochDay, delta));
        // Flush so a losing racer's primary-key violation surfaces here, where the caller's catch
        // falls back to incrementing the winner's row.
        entityManager.flush();
        entityManager.clear();
    }
}
