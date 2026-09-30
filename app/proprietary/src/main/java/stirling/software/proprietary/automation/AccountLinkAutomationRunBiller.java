package stirling.software.proprietary.automation;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.accountlink.DeviceCredentialStore;
import stirling.software.proprietary.accountlink.EntitlementCache;
import stirling.software.proprietary.accountlink.FreeTierUsageService;
import stirling.software.proprietary.accountlink.InstanceEntitlement;
import stirling.software.proprietary.accountlink.UsageMeterService;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.DocumentUnitCalculator;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;
import stirling.software.proprietary.billing.UnitCalcPolicy;

/**
 * Charges browser automation against the local free allowance while unlinked, or the cloud ledger
 * while linked. Local runs use {@link UnitCalcPolicy#DEFAULT}; linked runs require a synced policy
 * and period. Metering is instance-scoped, so no per-user context is needed.
 *
 * <p>A Server license includes Automate runs; Processor runs still consume credits. The cloud
 * metering switch does not disable local accrual. A null signature makes each run its own charge,
 * without workflow-window deduplication.
 */
@Slf4j
@Component
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class AccountLinkAutomationRunBiller implements AutomationRunBiller {

    private final LicenseServiceInterface licenseService;
    private final EntitlementCache entitlementCache;
    private final ObjectProvider<UsageMeterService> meterProvider;
    private final DeviceCredentialStore credentialStore;
    private final FreeTierUsageService freeTierUsageService;

    public AccountLinkAutomationRunBiller(
            EntitlementCache entitlementCache,
            ObjectProvider<UsageMeterService> meterProvider,
            DeviceCredentialStore credentialStore,
            FreeTierUsageService freeTierUsageService,
            LicenseServiceInterface licenseService) {
        this.licenseService = licenseService;
        this.entitlementCache = entitlementCache;
        this.meterProvider = meterProvider;
        this.credentialStore = credentialStore;
        this.freeTierUsageService = freeTierUsageService;
    }

    @Override
    public void recordAutomationRun(List<FileSize> inputs, AutomationRunSource source) {
        if (inputs.isEmpty()
                || licenseService.isRunningEE()
                || (source == AutomationRunSource.AUTOMATE && licenseService.hasServerLicense())) {
            return;
        }
        if (!credentialStore.isLinked()) {
            long units = DocumentUnitCalculator.unitsForGroup(inputs, UnitCalcPolicy.DEFAULT);
            freeTierUsageService.accrue(BillingCategory.AUTOMATION, units, null);
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
