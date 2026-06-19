package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Sort;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;

@ApplicationScoped
public class WalletLedgerRepository implements PanacheRepositoryBase<WalletLedgerEntry, Long> {

    /** Spring-style saveOrUpdate kept for callers; persists new rows, merges detached ones. */
    public WalletLedgerEntry save(WalletLedgerEntry entity) {
        if (entity.getId() == null) {
            persist(entity);
            return entity;
        }
        return getEntityManager().merge(entity);
    }

    /** Most recent entries for the Plan page activity feed. */
    public List<WalletLedgerEntry> findTop20ByTeamIdOrderByIdDesc(Long teamId) {
        return find("teamId", Sort.by("id", Sort.Direction.Descending), teamId).page(0, 20).list();
    }

    /**
     * Per-category debit totals over an arbitrary window, as positive units. Rows with NULL
     * category (system entries) are excluded; BYPASSED never reaches the ledger by construction.
     */
    public List<Object[]> sumPeriodAmountByCategory(
            Long teamId,
            LedgerEntryType entryType,
            LocalDateTime periodStart,
            LocalDateTime periodEnd) {
        return getEntityManager()
                .createQuery(
                        "SELECT e.billingCategory AS category,"
                                + " COALESCE(SUM(-e.amountUnits), 0) AS units"
                                + " FROM WalletLedgerEntry e"
                                + " WHERE e.teamId = :teamId"
                                + " AND e.entryType = :entryType"
                                + " AND e.billingCategory IS NOT NULL"
                                + " AND e.occurredAt >= :periodStart"
                                + " AND e.occurredAt < :periodEnd"
                                + " GROUP BY e.billingCategory",
                        Object[].class)
                .setParameter("teamId", teamId)
                .setParameter("entryType", entryType)
                .setParameter("periodStart", periodStart)
                .setParameter("periodEnd", periodEnd)
                .getResultList();
    }

    /** Sum of signed amounts over a team's entries - the wallet's current balance in units. */
    public long sumBalanceForTeam(Long teamId) {
        Long result =
                (Long)
                        getEntityManager()
                                .createQuery(
                                        "SELECT COALESCE(SUM(e.amountUnits), 0) FROM WalletLedgerEntry e WHERE e.teamId = :teamId")
                                .setParameter("teamId", teamId)
                                .getSingleResult();
        return result != null ? result : 0L;
    }

    /** Period-bounded spend for one team in units (debits only). */
    public long sumPeriodAmount(
            Long teamId,
            LedgerEntryType entryType,
            LocalDateTime periodStart,
            LocalDateTime periodEnd) {
        Long result =
                (Long)
                        getEntityManager()
                                .createQuery(
                                        "SELECT COALESCE(SUM(e.amountUnits), 0) FROM WalletLedgerEntry e"
                                                + " WHERE e.teamId = :teamId"
                                                + " AND e.entryType = :entryType"
                                                + " AND e.occurredAt >= :periodStart"
                                                + " AND e.occurredAt < :periodEnd")
                                .setParameter("teamId", teamId)
                                .setParameter("entryType", entryType)
                                .setParameter("periodStart", periodStart)
                                .setParameter("periodEnd", periodEnd)
                                .getSingleResult();
        return result != null ? result : 0L;
    }

    /**
     * Net signed period balance over billable entries (DEBIT negative + REFUND positive). Negate
     * for positive spend; unlike sumPeriodAmount (DEBIT only) this nets refunds.
     */
    public long sumPeriodNetBillable(
            Long teamId, LocalDateTime periodStart, LocalDateTime periodEnd) {
        Object result =
                getEntityManager()
                        .createQuery(
                                "SELECT COALESCE(SUM(e.amountUnits), 0) FROM WalletLedgerEntry e"
                                        + " WHERE e.teamId = :teamId"
                                        + " AND e.entryType IN (:debit, :refund)"
                                        + " AND e.occurredAt >= :periodStart"
                                        + " AND e.occurredAt < :periodEnd")
                        .setParameter("teamId", teamId)
                        .setParameter("debit", LedgerEntryType.DEBIT)
                        .setParameter("refund", LedgerEntryType.REFUND)
                        .setParameter("periodStart", periodStart)
                        .setParameter("periodEnd", periodEnd)
                        .getSingleResult();
        return ((Number) result).longValue();
    }

    /** Per-member period spend (only when the member has a sub-cap configured). */
    public long sumPeriodAmountForMember(
            Long teamId,
            Long actorUserId,
            LedgerEntryType entryType,
            LocalDateTime periodStart,
            LocalDateTime periodEnd) {
        Long result =
                (Long)
                        getEntityManager()
                                .createQuery(
                                        "SELECT COALESCE(SUM(e.amountUnits), 0) FROM WalletLedgerEntry e"
                                                + " WHERE e.teamId = :teamId AND e.actorUserId = :actorUserId"
                                                + " AND e.entryType = :entryType"
                                                + " AND e.occurredAt >= :periodStart"
                                                + " AND e.occurredAt < :periodEnd")
                                .setParameter("teamId", teamId)
                                .setParameter("actorUserId", actorUserId)
                                .setParameter("entryType", entryType)
                                .setParameter("periodStart", periodStart)
                                .setParameter("periodEnd", periodEnd)
                                .getSingleResult();
        return result != null ? result : 0L;
    }
}
