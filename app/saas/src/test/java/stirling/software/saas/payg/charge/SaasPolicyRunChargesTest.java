package stirling.software.saas.payg.charge;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * The half of the deferred meter that settles: a run's outcome decides whether the charges its
 * steps opened are billed or handed back.
 */
@ExtendWith(MockitoExtension.class)
class SaasPolicyRunChargesTest {

    @Mock private JobChargeService jobChargeService;

    @InjectMocks private SaasPolicyRunCharges charges;

    @Test
    void aSucceededRunIsWhatMovesTheMeter() {
        charges.settleBilled("user-1:run-abc");

        verify(jobChargeService).meterRun("user-1:run-abc");
        verify(jobChargeService, never()).releaseRun(any(), any());
    }

    @Test
    void aFailedRunHandsItsChargesBackInsteadOfBilling() {
        charges.settleUnbilled("user-1:run-abc", "Policy run failed: boom");

        verify(jobChargeService)
                .releaseRun("user-1:run-abc", "policy-run-failed:Policy run failed: boom");
        verify(jobChargeService, never()).meterRun(anyString());
    }
}
