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

    List<WalletLedgerEntry> findByTeamIdOrderByOccurredAtDesc(Long teamId);

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
