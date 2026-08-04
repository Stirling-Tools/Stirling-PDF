package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/** Persistence for the per-period/per-category usage counters (combined-billing "Mode A"). */
@ApplicationScoped
public class UsageCounterRepository implements PanacheRepositoryBase<UsageCounter, Long> {

    /**
     * Atomically adds {@code delta} to an existing counter row. Returns the number of rows updated
     * (0 when the row doesn't exist yet — the caller then inserts). Doing the add in SQL avoids a
     * read-modify-write race between concurrent billable requests.
     */
    @Transactional
    public int increment(
            LocalDateTime periodStart, String category, long delta, LocalDateTime now) {
        return update(
                "UPDATE UsageCounter c SET c.cumulativeUnits = c.cumulativeUnits + :delta,"
                        + " c.updatedAt = :now"
                        + " WHERE c.periodStart = :periodStart AND c.category = :category",
                Parameters.with("delta", delta)
                        .and("now", now)
                        .and("periodStart", periodStart)
                        .and("category", category));
    }

    /** All counters for a period — the daily sync reads these to report cumulative totals. */
    public List<UsageCounter> findByPeriodStart(LocalDateTime periodStart) {
        return list("periodStart", periodStart);
    }

    /**
     * Periods (oldest first) that still hold usage not yet accepted by SaaS. The sync reports each
     * so end-of-period usage isn't stranded when the billing period rolls over between syncs.
     */
    public List<LocalDateTime> findPeriodsWithUnsyncedUsage() {
        // Projection of a single column, so it goes through the EntityManager rather than Panache.
        return getEntityManager()
                .createQuery(
                        "SELECT DISTINCT c.periodStart FROM UsageCounter c"
                                + " WHERE c.cumulativeUnits > c.lastSyncedUnits ORDER BY"
                                + " c.periodStart",
                        LocalDateTime.class)
                .getResultList();
    }

    /**
     * Marks a counter synced up to {@code syncedUnits} (the cumulative value just accepted by
     * SaaS), not the live cumulative — concurrent accruals during the sync stay correctly unsynced.
     */
    @Transactional
    public int markSynced(LocalDateTime periodStart, String category, long syncedUnits) {
        return update(
                "UPDATE UsageCounter c SET c.lastSyncedUnits = :syncedUnits"
                        + " WHERE c.periodStart = :periodStart AND c.category = :category",
                Parameters.with("syncedUnits", syncedUnits)
                        .and("periodStart", periodStart)
                        .and("category", category));
    }

    /** Spring Data's {@code saveAndFlush}: flushes so the unique-constraint race surfaces here. */
    @Transactional
    public UsageCounter saveAndFlush(UsageCounter counter) {
        persistAndFlush(counter);
        return counter;
    }
}
