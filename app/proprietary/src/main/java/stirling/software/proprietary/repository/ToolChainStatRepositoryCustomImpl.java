package stirling.software.proprietary.repository;

import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import stirling.software.proprietary.model.ToolChainStat;

/** See {@link ToolChainStatRepositoryCustom}. */
class ToolChainStatRepositoryCustomImpl implements ToolChainStatRepositoryCustom {

    @PersistenceContext private EntityManager entityManager;

    @Override
    @Transactional
    public void insertCount(
            String principal, String chainKey, long epochDay, int chainLength, long delta) {
        entityManager.persist(new ToolChainStat(principal, chainKey, epochDay, chainLength, delta));
        // Flush so a losing racer's primary-key violation surfaces here, where the caller's catch
        // falls back to incrementing the winner's row.
        entityManager.flush();
        entityManager.clear();
    }
}
