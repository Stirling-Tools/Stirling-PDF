package stirling.software.proprietary.automation;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.proprietary.accountlink.EntitlementCache;
import stirling.software.proprietary.accountlink.EntitlementState;
import stirling.software.proprietary.accountlink.InstanceEntitlement;
import stirling.software.proprietary.accountlink.UsageMeterService;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;
import stirling.software.proprietary.billing.UnitCalcPolicy;

class AccountLinkAutomationRunBillerTest {

    private static final UnitCalcPolicy POLICY = new UnitCalcPolicy(10, 1_000_000L, 1, 1000);
    private static final LocalDateTime PERIOD = LocalDateTime.of(2026, 9, 1, 0, 0);

    @SuppressWarnings("unchecked")
    private static ObjectProvider<UsageMeterService> providerOf(UsageMeterService meter) {
        ObjectProvider<UsageMeterService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(meter);
        return provider;
    }

    private static InstanceEntitlement entitlement(UnitCalcPolicy policy, LocalDateTime period) {
        return new InstanceEntitlement(
                true, 0L, 0L, null, EntitlementState.OK, policy, period, null);
    }

    @Test
    void accruesComputedUnitsAsAutomation() {
        EntitlementCache cache = mock(EntitlementCache.class);
        when(cache.current()).thenReturn(Optional.of(entitlement(POLICY, PERIOD)));
        UsageMeterService meter = mock(UsageMeterService.class);
        AccountLinkAutomationRunBiller biller =
                new AccountLinkAutomationRunBiller(cache, providerOf(meter));

        // 25 pages -> ceil(25/10)=3 page units; 5000 bytes -> 1 byte unit; max = 3.
        biller.recordAutomationRun(List.of(new FileSize(25, 5000L)));

        verify(meter).accrue(PERIOD, BillingCategory.AUTOMATION, 3L, null);
    }

    @Test
    void noAccrueWhenMeterAbsent() {
        EntitlementCache cache = mock(EntitlementCache.class);
        AccountLinkAutomationRunBiller biller =
                new AccountLinkAutomationRunBiller(cache, providerOf(null));

        biller.recordAutomationRun(List.of(new FileSize(1, 10L)));

        verify(cache, never()).current();
    }

    @Test
    void noAccrueWhenEntitlementUnknown() {
        EntitlementCache cache = mock(EntitlementCache.class);
        when(cache.current()).thenReturn(Optional.empty());
        UsageMeterService meter = mock(UsageMeterService.class);
        AccountLinkAutomationRunBiller biller =
                new AccountLinkAutomationRunBiller(cache, providerOf(meter));

        biller.recordAutomationRun(List.of(new FileSize(1, 10L)));

        verify(meter, never())
                .accrue(
                        ArgumentMatchers.any(),
                        ArgumentMatchers.any(),
                        ArgumentMatchers.anyLong(),
                        ArgumentMatchers.any());
    }

    @Test
    void noAccrueWhenPeriodOrPolicyMissing() {
        EntitlementCache cache = mock(EntitlementCache.class);
        when(cache.current())
                .thenReturn(Optional.of(entitlement(POLICY, null)))
                .thenReturn(Optional.of(entitlement(null, PERIOD)));
        UsageMeterService meter = mock(UsageMeterService.class);
        AccountLinkAutomationRunBiller biller =
                new AccountLinkAutomationRunBiller(cache, providerOf(meter));

        biller.recordAutomationRun(List.of(new FileSize(1, 10L)));
        biller.recordAutomationRun(List.of(new FileSize(1, 10L)));

        verify(meter, never())
                .accrue(
                        ArgumentMatchers.any(),
                        ArgumentMatchers.any(),
                        ArgumentMatchers.anyLong(),
                        ArgumentMatchers.any());
    }

    @Test
    void noAccrueForEmptyInputs() {
        EntitlementCache cache = mock(EntitlementCache.class);
        UsageMeterService meter = mock(UsageMeterService.class);
        AccountLinkAutomationRunBiller biller =
                new AccountLinkAutomationRunBiller(cache, providerOf(meter));

        biller.recordAutomationRun(List.of());

        verify(cache, never()).current();
    }
}
