package stirling.software.saas.payg.charge;

import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.billing.PolicyRunCharges;
import stirling.software.saas.payg.filter.PaygChargeInterceptor;

/**
 * Settles a policy run's PAYG charge once the run says how it went. The charge interceptor defers
 * metering for run routes, so a failure here releases units that were never billed to Stripe, and a
 * success is what moves the meter.
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class SaasPolicyRunCharges implements PolicyRunCharges {

    private final JobChargeService jobChargeService;

    @Override
    public Optional<String> openedForCurrentRequest() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes servlet)) {
            // No request: an unattended sweep, which opens no charge of its own to settle.
            return Optional.empty();
        }
        Object jobId = servlet.getRequest().getAttribute(PaygChargeInterceptor.ATTR_JOB_ID);
        return jobId instanceof UUID id ? Optional.of(id.toString()) : Optional.empty();
    }

    @Override
    public void settleBilled(String chargeToken) {
        parse(chargeToken).ifPresent(jobChargeService::meterJobUsage);
    }

    @Override
    public void settleUnbilled(String chargeToken, String reason) {
        parse(chargeToken)
                .ifPresent(
                        id ->
                                jobChargeService.releaseUnmeteredCharge(
                                        id, "policy-run-failed:" + reason));
    }

    /** The token round-trips through the policy layer as a string, so it can arrive malformed. */
    private Optional<UUID> parse(String chargeToken) {
        try {
            return Optional.of(UUID.fromString(chargeToken));
        } catch (IllegalArgumentException | NullPointerException e) {
            log.warn("Not a charge id, so nothing to settle: {}", chargeToken);
            return Optional.empty();
        }
    }
}
