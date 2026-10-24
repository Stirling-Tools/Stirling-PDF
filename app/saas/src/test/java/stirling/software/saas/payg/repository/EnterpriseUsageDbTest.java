package stirling.software.saas.payg.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.LedgerBucket;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.model.ReferenceType;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;

@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@DataJpaTest(
        properties = {
            "spring.datasource.url=jdbc:h2:mem:enterpriseUsage;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
            "spring.jpa.hibernate.ddl-auto=create-drop"
        })
class EnterpriseUsageDbTest {
    @Autowired private WalletLedgerRepository ledger;
    @PersistenceContext private EntityManager em;

    @Test
    void agreementCountsIncludedDocumentsAndExcludesRefundsOtherTeamsAndOtherPeriods() {
        LocalDateTime start = LocalDateTime.of(2026, 1, 1, 0, 0);
        entry(7L, "ok", LedgerEntryType.DEBIT, 12, start);
        entry(7L, "failed", LedgerEntryType.DEBIT, 5, start);
        entry(7L, "failed", LedgerEntryType.REFUND, 0, start.plusDays(1));
        entry(8L, "other-team", LedgerEntryType.DEBIT, 100, start);
        entry(7L, "previous", LedgerEntryType.DEBIT, 100, start.minusSeconds(1));
        entry(7L, "next", LedgerEntryType.DEBIT, 100, start.plusYears(1));
        em.flush();
        assertThat(ledger.sumEnterprisePdfs(7L, start, start.plusYears(1))).isEqualTo(12);
    }

    private void entry(Long teamId, String job, LedgerEntryType type, int docs, LocalDateTime at) {
        var entry = new WalletLedgerEntry();
        entry.setTeamId(teamId);
        entry.setReferenceId(job);
        entry.setReferenceType(ReferenceType.JOB);
        entry.setEntryType(type);
        entry.setBucket(LedgerBucket.CYCLE);
        entry.setAmountUnits(0);
        entry.setDocCount(docs);
        entry.setBillingCategory(BillingCategory.API);
        ledger.saveAndFlush(entry);
        em.createQuery("UPDATE WalletLedgerEntry e SET e.occurredAt=:at WHERE e.id=:id")
                .setParameter("at", at)
                .setParameter("id", entry.getId())
                .executeUpdate();
    }

    @SpringBootConfiguration
    @EntityScan(basePackageClasses = WalletLedgerEntry.class)
    @EnableJpaRepositories(
            basePackageClasses = WalletLedgerRepository.class,
            includeFilters =
                    @ComponentScan.Filter(
                            type = FilterType.ASSIGNABLE_TYPE,
                            classes = WalletLedgerRepository.class))
    static class TestApp {}
}
