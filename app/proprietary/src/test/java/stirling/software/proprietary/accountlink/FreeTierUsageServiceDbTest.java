package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import stirling.software.proprietary.billing.BillingCategory;

/**
 * The local ledger against a real database, so the upsert, the {@code SUM} and the guarded roll
 * actually run. A moveable clock stands in for waiting out a month.
 */
@DataJpaTest
class FreeTierUsageServiceDbTest {

    private static final LocalDateTime T0 = LocalDateTime.of(2026, 1, 31, 9, 30);

    @Autowired private FreeTierPeriodRepository periods;
    @Autowired private FreeTierUsageCounterRepository counters;
    @Autowired private MeteredInputSignatureRepository signatures;
    @Autowired private UsageCounterRepository cloudCounters;
    @PersistenceContext private EntityManager em;

    private final AtomicReference<LocalDateTime> now = new AtomicReference<>(T0);

    private FreeTierUsageService service(long grant) {
        AccountLinkProperties props = new AccountLinkProperties();
        props.setFreeTierUnits(grant);
        return new FreeTierUsageService(periods, counters, signatures, props, now::get);
    }

    @Test
    void firstAccrualAnchorsThePeriodAndSpendsTheGrant() {
        FreeTierUsageService service = service(500);

        service.accrue(BillingCategory.API, 30, null);

        FreeTierUsageService.FreeTierBalance balance = service.balance();
        assertThat(balance.periodStart()).isEqualTo(T0);
        assertThat(balance.periodEnd()).isEqualTo(T0.plusMonths(1));
        assertThat(balance.grantUnits()).isEqualTo(500);
        assertThat(balance.usedUnits()).isEqualTo(30);
        assertThat(balance.remainingUnits()).isEqualTo(470);
    }

    @Test
    void spendAcrossCategoriesAccumulatesIntoOnePool() {
        FreeTierUsageService service = service(500);

        service.accrue(BillingCategory.API, 30, null);
        service.accrue(BillingCategory.AI, 12, null);
        service.accrue(BillingCategory.AUTOMATION, 8, null);
        service.accrue(BillingCategory.API, 5, null); // second hit on an existing row

        assertThat(service.balance().usedUnits()).isEqualTo(55);
        assertThat(counters.count()).isEqualTo(3); // one row per category, incremented in place
    }

    @Test
    void exactlyAtTheGrantLeavesNothing() {
        FreeTierUsageService service = service(100);

        service.accrue(BillingCategory.API, 100, null);

        assertThat(service.balance().remainingUnits()).isZero();
    }

    @Test
    void overshootingTheGrantFloorsAtZeroRatherThanGoingNegative() {
        // The gate allows before the meter charges, so the last op of a period can overshoot.
        FreeTierUsageService service = service(100);

        service.accrue(BillingCategory.API, 140, null);

        assertThat(service.balance().usedUnits()).isEqualTo(140);
        assertThat(service.balance().remainingUnits()).isZero();
    }

    @Test
    void manualToolsAreNeverCounted() {
        FreeTierUsageService service = service(500);

        service.accrue(BillingCategory.BYPASSED, 40, null);
        service.accrue(BillingCategory.API, 0, null);

        assertThat(counters.count()).isZero();
        assertThat(service.balance().usedUnits()).isZero();
    }

    @Test
    void crossingTheMonthBoundaryRollsThePeriodAndRestoresTheFullGrant() {
        FreeTierUsageService service = service(500);
        service.accrue(BillingCategory.API, 480, null);
        assertThat(service.balance().remainingUnits()).isEqualTo(20);

        now.set(T0.plusMonths(1).plusDays(2));

        FreeTierUsageService.FreeTierBalance rolled = service.balance();
        assertThat(rolled.periodStart()).isEqualTo(T0.plusMonths(1));
        assertThat(rolled.usedUnits()).isZero();
        assertThat(rolled.remainingUnits()).isEqualTo(500);
        // rollTo is a bulk update, so a loaded row would answer stale.
        em.clear();
        assertThat(periods.findById(FreeTierPeriod.SINGLETON_ID).orElseThrow().getPeriodStart())
                .isEqualTo(T0.plusMonths(1));
        assertThat(counters.sumUnits(T0)).isEqualTo(480);
    }

    @Test
    void aServerOfflineForMonthsLandsOnTheCurrentPeriodNotTheNextOne() {
        FreeTierUsageService service = service(500);
        service.accrue(BillingCategory.API, 10, null);

        now.set(T0.plusMonths(5).plusDays(1));

        assertThat(service.balance().periodStart()).isEqualTo(T0.plusMonths(5));
    }

    @Test
    void theAnchorDayDoesNotDriftDownShortMonths() {
        // T0 is a 31st: rolling from the previous start would pin it to the 28th after February.
        FreeTierUsageService service = service(500);
        service.accrue(BillingCategory.API, 1, null);

        now.set(LocalDateTime.of(2026, 3, 1, 0, 0));
        assertThat(service.balance().periodStart()).isEqualTo(LocalDateTime.of(2026, 2, 28, 9, 30));

        now.set(LocalDateTime.of(2026, 4, 1, 0, 0));
        assertThat(service.balance().periodStart()).isEqualTo(LocalDateTime.of(2026, 3, 31, 9, 30));
    }

    @Test
    void repeatingAnInputSetInsideTheWorkflowWindowIsNotCharged() {
        FreeTierUsageService service = service(500);

        service.accrue(BillingCategory.API, 20, "a".repeat(64));
        service.accrue(BillingCategory.API, 20, "a".repeat(64));

        assertThat(service.balance().usedUnits()).isEqualTo(20);
    }

    @Test
    void aDifferentInputSetIsChargedSeparately() {
        FreeTierUsageService service = service(500);

        service.accrue(BillingCategory.API, 20, "a".repeat(64));
        service.accrue(BillingCategory.API, 7, "b".repeat(64));

        assertThat(service.balance().usedUnits()).isEqualTo(27);
    }

    @Test
    void freeTierSpendIsInvisibleToTheCloudSyncAndSurvivesALinkUnlinkCycle() {
        FreeTierUsageService service = service(500);
        service.accrue(BillingCategory.API, 120, null);

        // Deliberately the same timestamp the free tier anchored on: the collision a shared
        // table would suffer.
        cloudCounters.saveAndFlush(new UsageCounter(T0, "API", 90, now.get()));
        List<LocalDateTime> pending = cloudCounters.findPeriodsWithUnsyncedUsage();
        cloudCounters.markSynced(T0, "API", 90);

        FreeTierUsageService.FreeTierBalance after = service.balance();

        assertThat(pending).containsExactly(T0); // the sync only ever saw its own 90 cloud units
        assertThat(cloudCounters.findPeriodsWithUnsyncedUsage()).isEmpty();
        assertThat(after.usedUnits()).isEqualTo(120);
        assertThat(after.remainingUnits()).isEqualTo(380);
        assertThat(after.periodStart()).isEqualTo(T0);
    }

    @Test
    void aZeroGrantLeavesNothingToSpend() {
        assertThat(service(0).balance().remainingUnits()).isZero();
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}
