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
     * Per-category debit totals with BOTH the size-scaled unit sum and the input-file count ({@code
     * doc_count}) over a window. Rows: {@code [category, units, docs]}. Lets the wallet show, per
     * category, "X PDFs · Y meter units" rather than conflating the two.
     */
    @Query(
            "SELECT e.billingCategory AS category, COALESCE(SUM(-e.amountUnits), 0) AS units,"
                    + " COALESCE(SUM(e.docCount), 0) AS docs"
                    + " FROM WalletLedgerEntry e"
                    + " WHERE e.teamId = :teamId"
                    + " AND e.entryType = :entryType"
                    + " AND e.billingCategory IS NOT NULL"
                    + " AND e.occurredAt >= :periodStart"
                    + " AND e.occurredAt < :periodEnd"
                    + " GROUP BY e.billingCategory")
    List<Object[]> sumPeriodByCategoryWithDocs(
            @Param("teamId") Long teamId,
            @Param("entryType") LedgerEntryType entryType,
            @Param("periodStart") LocalDateTime periodStart,
            @Param("periodEnd") LocalDateTime periodEnd);

    /**
     * Period usage analytics in one row: {@code [docsProcessed, uniquePdfs, sizeMultiplierPdfs]}.
     * {@code docsProcessed} sums input-file counts; {@code uniquePdfs} counts distinct input
     * fingerprints (a file hit by N operations counts once); {@code sizeMultiplierPdfs} sums the
     * input files on charges where the size multiplier kicked in (units billed &gt; input files).
     * DEBIT + non-null category only.
     */
    @Query(
            "SELECT COALESCE(SUM(e.docCount), 0) AS docs,"
                    + " COUNT(DISTINCT e.documentFingerprint) AS uniquePdfs,"
                    + " COALESCE(SUM(CASE WHEN (-e.amountUnits) > e.docCount THEN e.docCount ELSE 0"
                    + " END), 0) AS sizeMultiplierPdfs"
                    + " FROM WalletLedgerEntry e"
                    + " WHERE e.teamId = :teamId"
                    + " AND e.entryType = :entryType"
                    + " AND e.billingCategory IS NOT NULL"
                    + " AND e.occurredAt >= :periodStart"
                    + " AND e.occurredAt < :periodEnd")
    Object[] periodUsageAnalytics(
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
