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
     * Per-category debit totals with BOTH the size-scaled unit sum and the input-file count ({@code
     * doc_count}) over a window. Rows: {@code [category, units, docs]}. Lets the wallet show, per
     * category, "X PDFs · Y meter units" rather than conflating the two.
     */
    public List<Object[]> sumPeriodByCategoryWithDocs(
            Long teamId,
            LedgerEntryType entryType,
            LocalDateTime periodStart,
            LocalDateTime periodEnd) {
        return getEntityManager()
                .createQuery(
                        "SELECT e.billingCategory AS category,"
                                + " COALESCE(SUM(-e.amountUnits), 0) AS units,"
                                + " COALESCE(SUM(e.docCount), 0) AS docs"
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

    /**
     * Period usage analytics in one row: {@code [docsProcessed, uniquePdfs, sizeMultiplierPdfs]}.
     * {@code docsProcessed} sums input-file counts; {@code uniquePdfs} counts distinct input
     * fingerprints (a file hit by N operations counts once); {@code sizeMultiplierPdfs} sums the
     * input files on charges where the size multiplier kicked in (units billed &gt; input files).
     * DEBIT + non-null category only.
     *
     * <p>Returns a single-element {@code List} (aggregate-only query - always one row) so callers
     * keep the {@code get(0)} access the Spring Data version required.
     */
    public List<Object[]> periodUsageAnalytics(
            Long teamId,
            LedgerEntryType entryType,
            LocalDateTime periodStart,
            LocalDateTime periodEnd) {
        return getEntityManager()
                .createQuery(
                        "SELECT COALESCE(SUM(e.docCount), 0) AS docs,"
                                + " COUNT(DISTINCT e.documentFingerprint) AS uniquePdfs,"
                                + " COALESCE(SUM(CASE WHEN (-e.amountUnits) > e.docCount THEN"
                                + " e.docCount ELSE 0 END), 0) AS sizeMultiplierPdfs"
                                + " FROM WalletLedgerEntry e"
                                + " WHERE e.teamId = :teamId"
                                + " AND e.entryType = :entryType"
                                + " AND e.billingCategory IS NOT NULL"
                                + " AND e.occurredAt >= :periodStart"
                                + " AND e.occurredAt < :periodEnd",
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
