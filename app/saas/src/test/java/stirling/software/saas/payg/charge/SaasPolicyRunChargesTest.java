package stirling.software.saas.payg.charge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import stirling.software.saas.payg.filter.PaygChargeInterceptor;

/**
 * The half of the deferred meter that settles: a run's outcome decides whether the charge it was
 * submitted under is billed or handed back.
 */
@ExtendWith(MockitoExtension.class)
class SaasPolicyRunChargesTest {

    @Mock private JobChargeService jobChargeService;

    @InjectMocks private SaasPolicyRunCharges charges;

    @AfterEach
    void clearRequest() {
        RequestContextHolder.resetRequestAttributes();
    }

    private void bindRequestCharging(UUID jobId) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (jobId != null) {
            request.setAttribute(PaygChargeInterceptor.ATTR_JOB_ID, jobId);
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    @Test
    void readsTheChargeTheRequestOpened() {
        UUID jobId = UUID.randomUUID();
        bindRequestCharging(jobId);

        assertThat(charges.openedForCurrentRequest()).contains(jobId.toString());
    }

    @Test
    void hasNothingToSettleWhenTheRequestOpenedNoCharge() {
        // PAYG inactive for the team, so the interceptor never stashed an id.
        bindRequestCharging(null);

        assertThat(charges.openedForCurrentRequest()).isEmpty();
    }

    @Test
    void hasNothingToSettleOffARequestAltogether() {
        // An unattended sweep runs on a worker thread with no request bound to it.
        assertThat(charges.openedForCurrentRequest()).isEmpty();
    }

    @Test
    void aSucceededRunIsWhatMovesTheMeter() {
        UUID jobId = UUID.randomUUID();

        charges.settleBilled(jobId.toString());

        verify(jobChargeService).meterJobUsage(jobId);
        verify(jobChargeService, never()).releaseUnmeteredCharge(any(), any());
    }

    @Test
    void aFailedRunHandsTheChargeBackInsteadOfBilling() {
        UUID jobId = UUID.randomUUID();

        charges.settleUnbilled(jobId.toString(), "Policy run failed: boom");

        verify(jobChargeService)
                .releaseUnmeteredCharge(eq(jobId), eq("policy-run-failed:Policy run failed: boom"));
        verify(jobChargeService, never()).meterJobUsage(any());
    }

    @Test
    void aTokenThatIsNotAChargeIdSettlesNothingRatherThanThrowing() {
        // The token crosses the policy layer as an opaque string, and a run's terminal handler
        // must not be broken by one that cannot be read back.
        charges.settleBilled("not-a-uuid");
        charges.settleUnbilled(null, "boom");

        verify(jobChargeService, never()).meterJobUsage(any());
        verify(jobChargeService, never()).releaseUnmeteredCharge(any(), any());
    }
}
