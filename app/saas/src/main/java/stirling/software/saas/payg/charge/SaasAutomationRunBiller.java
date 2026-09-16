package stirling.software.saas.payg.charge;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.automation.AutomationRunBiller;
import stirling.software.proprietary.billing.DocumentUnitCalculator;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Charges one client-side Automate run as a standalone AUTOMATION job, on the input set's doc-units
 * with the team's effective {@link PricingPolicy} - so a browser-run workflow costs the same as the
 * equivalent server-side policy over the same inputs.
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
public class SaasAutomationRunBiller implements AutomationRunBiller {

    private final UserRepository userRepository;
    private final PricingPolicyService pricingPolicyService;
    private final JobChargeService jobChargeService;

    @Override
    public void recordAutomationRun(List<FileSize> inputs) {
        if (inputs.isEmpty()) {
            return;
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        User user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        if (user == null || user.getTeam() == null) {
            return;
        }
        PricingPolicy policy = pricingPolicyService.getEffectivePolicy(user.getTeam().getId());
        UnitCalcPolicy unitCalc =
                new UnitCalcPolicy(
                        policy.getDocPagesPerUnit(),
                        policy.getDocBytesPerUnit(),
                        policy.getMinChargeUnits(),
                        policy.getFileUnitCap());
        int units = DocumentUnitCalculator.unitsForGroup(inputs, unitCalc);

        JobSource source =
                auth instanceof ApiKeyAuthenticationToken ? JobSource.API : JobSource.WEB;
        ChargeContext ctx =
                new ChargeContext(
                        user.getId(),
                        user.getTeam().getId(),
                        source,
                        ProcessType.AUTOMATION,
                        BillingCategory.AUTOMATION);
        // chargeStandalone re-resolves the effective policy and applies its minChargeUnits floor.
        jobChargeService.chargeStandalone(ctx, units);
    }
}
