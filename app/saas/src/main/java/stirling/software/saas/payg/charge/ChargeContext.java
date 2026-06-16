package stirling.software.saas.payg.charge;

import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;

/**
 * Per-call context for {@link JobChargeService#openProcess}. Carries the caller's identity and what
 * kind of process this is. Does NOT carry policy fields — the charge service resolves the effective
 * policy from {@code PricingPolicyService} so a stale snapshot from the caller can't desync from
 * the live policy.
 */
public record ChargeContext(
        Long ownerUserId, Long ownerTeamId, JobSource source, ProcessType processType) {

    public ChargeContext {
        if (ownerUserId == null) {
            throw new IllegalArgumentException("ownerUserId is required");
        }
        if (source == null) {
            throw new IllegalArgumentException("source is required");
        }
        if (processType == null) {
            throw new IllegalArgumentException("processType is required");
        }
    }
}
