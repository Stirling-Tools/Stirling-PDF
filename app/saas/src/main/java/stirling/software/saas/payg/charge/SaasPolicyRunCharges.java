package stirling.software.saas.payg.charge;

import java.util.Objects;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.billing.PolicyRunCharges;

/**
 * Settles a policy run's PAYG charges once the run says how it went. The charge interceptor leaves
 * every tool step inside a run unmetered, so a failure here releases units that never reached
 * Stripe, and a success is what moves the meter.
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
public class SaasPolicyRunCharges implements PolicyRunCharges {

    private final JobChargeService jobChargeService;

    @Override
    public void settleBilled(String runId) {
        jobChargeService.meterRun(Objects.requireNonNull(runId, "runId"));
    }

    @Override
    public void settleUnbilled(String runId, String reason) {
        jobChargeService.releaseRun(
                Objects.requireNonNull(runId, "runId"), "policy-run-failed:" + reason);
    }
}
