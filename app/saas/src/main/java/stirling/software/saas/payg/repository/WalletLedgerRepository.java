package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;

@ApplicationScoped
public class WalletLedgerRepository implements PanacheRepositoryBase<WalletLedgerEntry, Long> {

    public List<WalletLedgerEntry> findByTeamIdOrderByOccurredAtDesc(Long teamId) {
        return find("teamId = ?1 ORDER BY occurredAt DESC", teamId).list();
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
