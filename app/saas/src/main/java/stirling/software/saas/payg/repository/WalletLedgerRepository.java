package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;

@Repository
public interface WalletLedgerRepository extends JpaRepository<WalletLedgerEntry, Long> {

    /** Most recent entries for the Plan page activity feed. */
    List<WalletLedgerEntry> findTop20ByTeamIdOrderByIdDesc(Long teamId);

    /**
     * Per-category debit totals over an arbitrary window, as positive units. Replaces the
     * calendar-month {@code wallet_category_summary} view on the wallet endpoint — subscribed
     * teams' billing windows are anchored to the Stripe subscription period, not month starts. Rows
     * with {@code NULL} category (system entries) are excluded; BYPASSED never reaches the ledger
     * by construction.
     */
    @Query(
            "SELECT e.billingCategory AS category, COALESCE(SUM(-e.amountUnits), 0) AS units"
                    + " FROM WalletLedgerEntry e"
                    + " WHERE e.teamId = :teamId"
                    + " AND e.entryType = :entryType"
                    + " AND e.billingCategory IS NOT NULL"
                    + " AND e.occurredAt >= :periodStart"
                    + " AND e.occurredAt < :periodEnd"
                    + " GROUP BY e.billingCategory")
    List<Object[]> sumPeriodAmountByCategory(
            @Param("teamId") Long teamId,
            @Param("entryType") LedgerEntryType entryType,
            @Param("periodStart") LocalDateTime periodStart,
            @Param("periodEnd") LocalDateTime periodEnd);

    /** Sum of signed amounts over a team's entries — the wallet's current balance in units. */
    @Query(
            "SELECT COALESCE(SUM(e.amountUnits), 0) FROM WalletLedgerEntry e WHERE e.teamId = :teamId")
    long sumBalanceForTeam(@Param("teamId") Long teamId);

    /** Period-bounded spend for one team in units (debits only). */
    @Query(
            "SELECT COALESCE(SUM(e.amountUnits), 0) FROM WalletLedgerEntry e"
                    + " WHERE e.teamId = :teamId"
                    + " AND e.entryType = :entryType"
                    + " AND e.occurredAt >= :periodStart"
                    + " AND e.occurredAt < :periodEnd")
    long sumPeriodAmount(
            @Param("teamId") Long teamId,
            @Param("entryType") LedgerEntryType entryType,
            @Param("periodStart") LocalDateTime periodStart,
            @Param("periodEnd") LocalDateTime periodEnd);

    /**
     * Net signed period balance over billable entries (DEBIT negative + REFUND positive). Negate
     * for positive spend. Unlike {@link #sumPeriodAmount} (DEBIT only) this nets refunds, so a
     * refunded job no longer reads as spent — the headline period-spend figure for the subscribed
     * monthly bill + cap.
     */
    @Query(
            "SELECT COALESCE(SUM(e.amountUnits), 0) FROM WalletLedgerEntry e"
                    + " WHERE e.teamId = :teamId"
                    + " AND e.entryType IN (stirling.software.saas.payg.model.LedgerEntryType.DEBIT,"
                    + " stirling.software.saas.payg.model.LedgerEntryType.REFUND)"
                    + " AND e.occurredAt >= :periodStart"
                    + " AND e.occurredAt < :periodEnd")
    long sumPeriodNetBillable(
            @Param("teamId") Long teamId,
            @Param("periodStart") LocalDateTime periodStart,
            @Param("periodEnd") LocalDateTime periodEnd);

    /** Per-member period spend (only when the member has a sub-cap configured). */
    @Query(
            "SELECT COALESCE(SUM(e.amountUnits), 0) FROM WalletLedgerEntry e"
                    + " WHERE e.teamId = :teamId AND e.actorUserId = :actorUserId"
                    + " AND e.entryType = :entryType"
                    + " AND e.occurredAt >= :periodStart"
                    + " AND e.occurredAt < :periodEnd")
    long sumPeriodAmountForMember(
            @Param("teamId") Long teamId,
            @Param("actorUserId") Long actorUserId,
            @Param("entryType") LedgerEntryType entryType,
            @Param("periodStart") LocalDateTime periodStart,
            @Param("periodEnd") LocalDateTime periodEnd);
}
