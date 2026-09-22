package stirling.software.saas.accountlink;

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
 * Bills a linked instance's cloud AI call to the team that owns it.
 *
 * <p>This is the <b>only</b> meter for work run in cloud mode. The instance suppresses its own
 * local metering when it is routing here, because both meters write a DEBIT to the same team's
 * wallet ledger and neither knows the other exists - so leaving both on charges one user action
 * twice. That constraint is pinned by {@code AiCloudDoubleChargeTest}.
 *
 * <p>Reasoning calls are billed flat rather than by document size: the gateway forwards JSON bodies
 * it does not parse, so it has no page or byte count to work from, and inventing one from the body
 * length would bill a long prompt like a long document.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceAiUsageService {

    /** Paths that are bookkeeping rather than reasoning, and so cost nothing. */
    private static final java.util.Set<String> FREE_PATHS =
            java.util.Set.of(
                    "/health", "/api/v1/agents/capabilities", "/api/v1/documents/by-owner");

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
            // Same stance as the nightly sync: without an actor the charge cannot be attributed, so
            // skip rather than guess. Visible in logs, and the work still happened.
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
