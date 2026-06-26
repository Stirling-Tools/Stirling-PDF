package stirling.software.saas.payg.charge;

import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;

/**
 * Per-call context for {@link JobChargeService#openProcess}. Carries the caller's identity and what
 * kind of process this is. Does NOT carry policy fields — the charge service resolves the effective
 * policy from {@code PricingPolicyService} so a stale snapshot from the caller can't desync from
 * the live policy.
 *
 * <p>{@code billingCategory} is the analytics axis for ledger + shadow rows and is determined by
 * the interceptor before this context is built. Manual UI tools never reach {@code openProcess}
 * (they short-circuit on {@link BillingCategory#BYPASSED}); any context constructed here therefore
 * carries one of {@code API}, {@code AI}, or {@code AUTOMATION}.
 */
public record ChargeContext(
        Long ownerUserId,
        Long ownerTeamId,
        JobSource source,
        ProcessType processType,
        BillingCategory billingCategory) {

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
        if (billingCategory == null) {
            throw new IllegalArgumentException("billingCategory is required");
        }
    }
}
