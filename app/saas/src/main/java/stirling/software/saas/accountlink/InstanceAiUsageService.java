package stirling.software.saas.accountlink;

import java.util.Set;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;

/**
 * The only meter for a linked instance's cloud AI, since the instance skips its own for cloud work.
 * Billed flat per call: the gateway never parses a page or byte count out of the body.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceAiUsageService {

    /** Bookkeeping routes that run no model, so cost nothing. */
    private static final Set<String> FREE_PATHS =
            Set.of("/health", "/api/v1/agents/capabilities", "/api/v1/documents/by-owner");

    private final JobChargeService chargeService;
    private final LinkedInstanceRepository linkedInstanceRepository;

    public InstanceAiUsageService(
            JobChargeService chargeService, LinkedInstanceRepository linkedInstanceRepository) {
        this.chargeService = chargeService;
        this.linkedInstanceRepository = linkedInstanceRepository;
    }

    @Transactional
    public void recordCall(Long teamId, Long instanceId, String enginePath) {
        if (teamId == null || instanceId == null || FREE_PATHS.contains(enginePath)) {
            return;
        }
        Long actorUserId =
                linkedInstanceRepository
                        .findById(instanceId)
                        .map(LinkedInstance::getCreatedByUserId)
                        .orElse(null);
        if (actorUserId == null) {
            // Same as the nightly sync: a charge with no actor cannot be attributed, so skip it.
            log.warn(
                    "Cloud AI call for instance {} has no linking admin; not billing {}",
                    instanceId,
                    enginePath);
            return;
        }
        chargeService.chargeStandalone(
                new ChargeContext(
                        actorUserId,
                        teamId,
                        JobSource.LINKED_INSTANCE,
                        ProcessType.SINGLE_TOOL,
                        BillingCategory.AI,
                        null),
                1);
    }
}
