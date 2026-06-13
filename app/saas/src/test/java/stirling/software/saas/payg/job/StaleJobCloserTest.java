package stirling.software.saas.payg.job;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

/**
 * Smoke test for the scheduler wiring. The interesting close logic is exercised in {@link
 * JobServiceTest#closeStale_closesAllStaleJobs}; here we just confirm the scheduler bean delegates
 * to {@code JobService.closeStale} and tolerates an empty result without erroring.
 */
class StaleJobCloserTest {

    @Test
    void closeStale_invokesJobService() {
        JobService jobService = Mockito.mock(JobService.class);
        when(jobService.closeStale()).thenReturn(3);

        new StaleJobCloser(jobService).closeStale();

        verify(jobService).closeStale();
    }

    @Test
    void closeStale_zeroClosedDoesNotThrow() {
        JobService jobService = Mockito.mock(JobService.class);
        when(jobService.closeStale()).thenReturn(0);

        new StaleJobCloser(jobService).closeStale();

        verify(jobService).closeStale();
    }
}
