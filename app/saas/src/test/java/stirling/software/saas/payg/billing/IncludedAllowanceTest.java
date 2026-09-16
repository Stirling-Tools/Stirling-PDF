package stirling.software.saas.payg.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import stirling.software.saas.payg.policy.PaygTeamExtensions;

class IncludedAllowanceTest {
    private final LocalDateTime now = LocalDateTime.of(2026, 9, 16, 12, 0);

    @Test
    void upgradeIsTotalAllowanceAndCannotBeClaimedTwice() {
        PaygTeamExtensions ext = current(1000, 700);
        IncludedAllowance upgraded = IncludedAllowance.resolve(ext, 2500, now);
        assertThat(upgraded.remaining()).isEqualTo(2200);
        upgraded.store(ext, upgraded.remaining() - 10);
        assertThat(IncludedAllowance.resolve(ext, 2500, now).remaining()).isEqualTo(2190);
        assertThat(IncludedAllowance.resolve(ext, 1000, now).remaining()).isEqualTo(2190);
    }

    @Test
    void downgradeTakesEffectAtNextMonthWithNoRollover() {
        PaygTeamExtensions ext = current(2500, 2200);
        IncludedAllowance renewed = IncludedAllowance.resolve(ext, 1000, now.plusMonths(1));
        assertThat(renewed.granted()).isEqualTo(1000);
        assertThat(renewed.remaining()).isEqualTo(1000);
        assertThat(renewed.start()).isEqualTo(LocalDateTime.of(2026, 10, 1, 0, 0));
    }

    @Test
    void annualTeamRenewsMonthlyAndSkipsUnusedMonths() {
        PaygTeamExtensions ext = current(2500, 0);
        IncludedAllowance renewed = IncludedAllowance.resolve(ext, 2500, now.plusMonths(8));
        assertThat(renewed.remaining()).isEqualTo(2500);
        assertThat(renewed.end()).isEqualTo(LocalDateTime.of(2027, 6, 1, 0, 0));
    }

    @Test
    void migratedMidMonthTermIsHonoredUntilItsEnd() {
        PaygTeamExtensions ext = current(1000, 700);
        ext.setFreeUnitsPeriodStart(now.minusDays(5));
        ext.setFreeUnitsPeriodEnd(now.minusDays(5).plusMonths(1));
        assertThat(IncludedAllowance.resolve(ext, 1000, now.plusDays(16)).remaining())
                .isEqualTo(700);
        assertThat(IncludedAllowance.resolve(ext, 1000, now.plusMonths(1)).remaining())
                .isEqualTo(1000);
    }

    private PaygTeamExtensions current(long granted, long remaining) {
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setFreeUnitsGranted(granted);
        ext.setFreeUnitsRemaining(remaining);
        ext.setFreeUnitsPeriodStart(LocalDateTime.of(2026, 9, 1, 0, 0));
        ext.setFreeUnitsPeriodEnd(LocalDateTime.of(2026, 10, 1, 0, 0));
        return ext;
    }
}
