package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class LocalUsageServiceTest {

    @Mock private UsageCounterRepository counters;
    @Mock private EntitlementCache entitlementCache;

    private LocalUsageService service;
    private final LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);

    @BeforeEach
    void setUp() {
        service = new LocalUsageService(counters, entitlementCache);
    }

    private static UsageCounter counter(
            LocalDateTime period, String category, long cumulative, long synced) {
        return new UsageCounter(period, category, cumulative, synced, LocalDateTime.now());
    }

    private static InstanceEntitlement entitledFor(LocalDateTime periodStart) {
        return new InstanceEntitlement(
                true,
                0,
                0,
                null,
                EntitlementState.OK,
                null,
                periodStart,
                periodStart.plusMonths(1));
    }

    @Test
    void unknownPeriodReturnsZeros() {
        when(entitlementCache.current()).thenReturn(Optional.empty());

        LocalUsageService.LocalUsage usage = service.currentPeriodUnsynced();

        assertThat(usage.periodStart()).isNull();
        assertThat(usage.totalUnsyncedUnits()).isZero();
    }

    @Test
    void sumsPerCategoryUnsyncedDeltaForCurrentPeriod() {
        when(entitlementCache.current()).thenReturn(Optional.of(entitledFor(period)));
        when(counters.findByPeriodStart(period))
                .thenReturn(
                        List.of(
                                counter(period, "API", 30L, 10L), // 20 unsynced
                                counter(period, "AI", 4L, 4L), // 0 unsynced (all reported)
                                counter(period, "AUTOMATION", 7L, 2L))); // 5 unsynced

        LocalUsageService.LocalUsage usage = service.currentPeriodUnsynced();

        assertThat(usage.periodStart()).isEqualTo(period);
        assertThat(usage.apiUnsyncedUnits()).isEqualTo(20L);
        assertThat(usage.aiUnsyncedUnits()).isEqualTo(0L);
        assertThat(usage.automationUnsyncedUnits()).isEqualTo(5L);
        assertThat(usage.totalUnsyncedUnits()).isEqualTo(25L);
    }
}
