package stirling.software.proprietary.automation;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.accountlink.EntitlementCache;
import stirling.software.proprietary.accountlink.InstanceEntitlement;
import stirling.software.proprietary.accountlink.UsageMeterService;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.DocumentUnitCalculator;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;
import stirling.software.proprietary.billing.UnitCalcPolicy;

/**
 * Charges a client-side Automate run on a linked self-hosted instance: computes the input set's
 * doc-units with the instance's synced {@link UnitCalcPolicy} and accrues them as {@link
 * BillingCategory#AUTOMATION}, exactly as the {@code InstanceEntitlementInterceptor} meters a
 * policy's tool sub-steps. Metering is instance-scoped, so no per-user context is needed.
 *
 * <p>Metering itself is optional (the {@link UsageMeterService} bean is absent when {@code
 * metering.enabled=false}); a null signature is passed so each run is its own charge (the
 * standalone semantic - no workflow-window dedup).
 */
@Slf4j
@Component
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class AccountLinkAutomationRunBiller implements AutomationRunBiller {

    private final EntitlementCache entitlementCache;
    private final ObjectProvider<UsageMeterService> meterProvider;

    public AccountLinkAutomationRunBiller(
            EntitlementCache entitlementCache, ObjectProvider<UsageMeterService> meterProvider) {
        this.entitlementCache = entitlementCache;
        this.meterProvider = meterProvider;
    }

    @Override
    public void recordAutomationRun(List<FileSize> inputs) {
        if (inputs.isEmpty()) {
            return;
        }
        UsageMeterService meter = meterProvider.getIfAvailable();
        if (meter == null) {
            return; // metering switch off
        }
        InstanceEntitlement ent = entitlementCache.current().orElse(null);
        if (ent == null || ent.unitCalcPolicy() == null || ent.periodStart() == null) {
            // Not yet synced (no policy/period) - can't compute units; skip until next sync.
            return;
        }
        UnitCalcPolicy policy = ent.unitCalcPolicy();
        long units = DocumentUnitCalculator.unitsForGroup(inputs, policy);
        meter.accrue(ent.periodStart(), BillingCategory.AUTOMATION, units, null);
    }
}
