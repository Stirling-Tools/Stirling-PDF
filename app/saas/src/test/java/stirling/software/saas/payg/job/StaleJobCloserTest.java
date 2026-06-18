package stirling.software.saas.payg.job;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.saas.payg.charge.JobChargeService;

/**
 * Smoke test for the scheduler wiring. Confirms the scheduler closes each stale job through {@link
 * JobChargeService#close} (so the Stripe meter afterCommit hook fires per job), isolates per-job
 * failures, and tolerates an empty stale set without erroring. The close/meter logic itself is
 * exercised in {@code JobChargeServiceTest}.
 */
class StaleJobCloserTest {

    private static ProcessingJob job(UUID id) {
        ProcessingJob j = new ProcessingJob();
        j.setId(id);
        return j;
    }

    @Test
    void closeStale_closesEachStaleJobThroughChargeService() {
        JobService jobService = Mockito.mock(JobService.class);
        JobChargeService chargeService = Mockito.mock(JobChargeService.class);
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        when(jobService.findStale()).thenReturn(List.of(job(a), job(b)));

        new StaleJobCloser(jobService, chargeService).closeStale();

        // Routed through the charge service (meter hook), NOT the bulk closeStale flip.
        verify(chargeService).close(a);
        verify(chargeService).close(b);
        verify(jobService, never()).closeStale();
    }

    @Test
    void closeStale_oneJobFailing_doesNotStrandTheRest() {
        JobService jobService = Mockito.mock(JobService.class);
        JobChargeService chargeService = Mockito.mock(JobChargeService.class);
        UUID bad = UUID.randomUUID();
        UUID good = UUID.randomUUID();
        when(jobService.findStale()).thenReturn(List.of(job(bad), job(good)));
        when(chargeService.close(bad)).thenThrow(new RuntimeException("boom"));

        // Must not propagate — the sweep continues to the next job.
        new StaleJobCloser(jobService, chargeService).closeStale();

        verify(chargeService).close(bad);
        verify(chargeService).close(good);
    }

    @Test
    void closeStale_emptyStaleSet_doesNotTouchChargeService() {
        JobService jobService = Mockito.mock(JobService.class);
        JobChargeService chargeService = Mockito.mock(JobChargeService.class);
        when(jobService.findStale()).thenReturn(List.of());

        new StaleJobCloser(jobService, chargeService).closeStale();

        verify(chargeService, never()).close(any());
    }
}
