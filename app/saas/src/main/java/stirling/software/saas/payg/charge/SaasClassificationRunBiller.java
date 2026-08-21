package stirling.software.saas.payg.charge;

import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.classification.ClassificationRunBiller;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Charges one PAYG unit per document as an AUTOMATION job, matching what a server-side classify
 * policy step bills.
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
public class SaasClassificationRunBiller implements ClassificationRunBiller {

    private final UserRepository userRepository;
    private final JobChargeService jobChargeService;

    @Override
    public void recordClassificationRun(int documentCount) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        User user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        if (user == null || user.getTeam() == null) {
            return;
        }
        JobSource source =
                auth instanceof ApiKeyAuthenticationToken ? JobSource.API : JobSource.WEB;
        ChargeContext ctx =
                new ChargeContext(
                        user.getId(),
                        user.getTeam().getId(),
                        source,
                        ProcessType.AUTOMATION,
                        BillingCategory.AUTOMATION);
        jobChargeService.chargeStandalone(ctx, Math.max(1, documentCount));
    }
}
