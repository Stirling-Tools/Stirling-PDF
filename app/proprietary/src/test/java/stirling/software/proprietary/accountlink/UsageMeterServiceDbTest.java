package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.billing.BillingCategory;

@DataJpaTest(showSql = false)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class UsageMeterServiceDbTest {

    private static final LocalDateTime PERIOD = LocalDateTime.of(2026, 6, 1, 0, 0);

    @Autowired private UsageCounterRepository counters;
    @Autowired private MeteredInputSignatureRepository signatures;
    @Autowired private JdbcTemplate jdbc;

    private UsageMeterService meter;

    @BeforeEach
    void setUp() {
        meter = new UsageMeterService(counters, signatures, new AccountLinkProperties());
    }

    @AfterEach
    void cleanUp() {
        counters.deleteAllInBatch();
        signatures.deleteAllInBatch();
    }

    @Test
    void stepAfterLimitChargesItsCurrentInputsAndStartsAnotherGroup() {
        for (int step = 0; step < 20; step++) {
            accrue("run:0", 3, 20);
        }
        assertThat(totalUnits()).isEqualTo(3);

        meter = new UsageMeterService(counters, signatures, new AccountLinkProperties());
        accrue("run:0", 7, 20);
        assertThat(totalUnits()).isEqualTo(10);
        assertThat(state("run:0").getStepCount()).isEqualTo(1);

        for (int step = 0; step < 19; step++) {
            accrue("run:0", 9, 20);
        }
        assertThat(totalUnits()).isEqualTo(10);
        accrue("run:0", 2, 20);
        assertThat(totalUnits()).isEqualTo(12);
    }

    @Test
    void eachDocumentHasItsOwnStepAllowance() {
        accrue("run:0", 3, 2);
        accrue("run:1", 5, 2);
        accrue("run:0", 3, 2);
        accrue("run:1", 5, 2);
        assertThat(totalUnits()).isEqualTo(8);

        accrue("run:0", 7, 2);
        assertThat(totalUnits()).isEqualTo(15);
        assertThat(state("run:1").getStepCount()).isEqualTo(2);
    }

    @Test
    void expiredWindowResetsTheStepAllowance() {
        signatures.saveAndFlush(
                new MeteredInputSignature(PERIOD, "run:0", LocalDateTime.now().minusMinutes(10)));

        accrue("run:0", 3, 2);
        accrue("run:0", 7, 2);
        assertThat(totalUnits()).isEqualTo(3);
        accrue("run:0", 5, 2);
        assertThat(totalUnits()).isEqualTo(8);
    }

    @Test
    void legacyRowsCountAsOnePreviouslyChargedStep() {
        signatures.saveAndFlush(new MeteredInputSignature(PERIOD, "run:0", LocalDateTime.now()));
        jdbc.update(
                "UPDATE account_link_metered_signature SET step_count = NULL, last_metered_at = NULL");

        accrue("run:0", 3, 2);
        assertThat(totalUnits()).isZero();
        assertThat(state("run:0").getStepCount()).isEqualTo(2);
        accrue("run:0", 7, 2);
        assertThat(totalUnits()).isEqualTo(7);
    }

    @Test
    void missingAndNonPositiveLimitsUseTenSteps() {
        for (int step = 0; step < 10; step++) {
            accrue("run:0", 1, 0);
        }
        assertThat(totalUnits()).isEqualTo(1);
        accrue("run:0", 1, -1);
        assertThat(totalUnits()).isEqualTo(2);
    }

    @Test
    void limitOfOneChargesEverySuccessfulStep() {
        accrue("run:0", 3, 1);
        accrue("run:0", 5, 1);
        accrue("run:0", 7, 1);
        assertThat(totalUnits()).isEqualTo(15);
        assertThat(state("run:0").getStepCount()).isEqualTo(1);
    }

    @Test
    void standaloneCallsAlwaysCharge() {
        accrue(null, 3, 20);
        accrue(null, 3, 20);
        assertThat(totalUnits()).isEqualTo(6);
        assertThat(signatures.count()).isZero();
    }

    @Test
    void concurrentCompletionsCountEveryStepAndChargeEachGroupOnce() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(4)) {
            List<Future<?>> futures = new ArrayList<>();
            for (int step = 0; step < 40; step++) {
                futures.add(
                        executor.submit(
                                () -> {
                                    assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                                    accrue("run:0", 1, 5);
                                    return null;
                                }));
            }
            start.countDown();
            for (Future<?> future : futures) {
                future.get(30, TimeUnit.SECONDS);
            }
        }
        assertThat(totalUnits()).isEqualTo(8);
        assertThat(state("run:0").getStepCount()).isEqualTo(5);
    }

    private void accrue(String key, long units, int stepLimit) {
        meter.accrue(PERIOD, BillingCategory.AUTOMATION, units, key, stepLimit);
    }

    private long totalUnits() {
        return counters.findAll().stream().mapToLong(UsageCounter::getCumulativeUnits).sum();
    }

    private MeteredInputSignature state(String key) {
        return signatures.findByPeriodStartAndSignature(PERIOD, key).orElseThrow();
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}
