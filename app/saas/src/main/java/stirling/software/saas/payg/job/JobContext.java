package stirling.software.saas.payg.job;

import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;

/**
 * Input to {@link JobService#joinOrOpen}: who owns the request, what process shape it is, which
 * policy version applies, and the step-limit ceiling derived from that policy for this caller
 * surface. {@code stepLimit} is resolved by the caller (typically {@code JobChargeService}) rather
 * than re-fetched here so the service stays free of policy-lookup concerns.
 */
public record JobContext(
        Long ownerUserId,
        Long ownerTeamId,
        JobSource source,
        ProcessType processType,
        Long policyId,
        int stepLimit) {

    public JobContext {
        if (ownerUserId == null) {
            throw new IllegalArgumentException("ownerUserId is required");
        }
        if (source == null) {
            throw new IllegalArgumentException("source is required");
        }
        if (processType == null) {
            throw new IllegalArgumentException("processType is required");
        }
        if (policyId == null) {
            throw new IllegalArgumentException("policyId is required");
        }
        if (stepLimit <= 0) {
            throw new IllegalArgumentException("stepLimit must be > 0");
        }
    }
}
