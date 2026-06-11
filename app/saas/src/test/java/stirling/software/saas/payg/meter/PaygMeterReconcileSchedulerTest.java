package stirling.software.saas.payg.meter;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.domain.Pageable;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygMeterEventLogRepository;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;

/**
 * Unit tests for {@link PaygMeterReconcileScheduler}: retries unposted events for still-subscribed
 * teams under the same idempotency key, skips teams that have since unsubscribed, and no-ops when
 * disabled.
 */
class PaygMeterReconcileSchedulerTest {

    private PaygMeterEventLogRepository logRepo;
    private PaygTeamExtensionsRepository teamExtRepo;
    private PaygMeterReportingService meterReportingService;
    private MeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        logRepo = Mockito.mock(PaygMeterEventLogRepository.class);
        teamExtRepo = Mockito.mock(PaygTeamExtensionsRepository.class);
        meterReportingService = Mockito.mock(PaygMeterReportingService.class);
        meterRegistry = new SimpleMeterRegistry();
        when(logRepo.countStuck(any())).thenReturn(0L);
    }

    private PaygMeterReconcileScheduler scheduler(boolean enabled) {
        return new PaygMeterReconcileScheduler(
                logRepo,
                teamExtRepo,
                meterReportingService,
                enabled,
                Duration.ofMinutes(5),
                100,
                meterRegistry);
    }

    private static PaygMeterEventLog row(Long teamId, UUID jobId, String key, int units) {
        PaygMeterEventLog e = new PaygMeterEventLog();
        e.setTeamId(teamId);
        e.setJobId(jobId);
        e.setIdempotencyKey(key);
        e.setUnits(units);
        return e;
    }

    private static PaygTeamExtensions ext(Long teamId, String customerId, String subscriptionId) {
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(teamId);
        ext.setStripeCustomerId(customerId);
        ext.setPaygSubscriptionId(subscriptionId);
        return ext;
    }

    @Test
    void reconcile_subscribedTeam_reMetersUnderSameKey() {
        UUID jobId = UUID.randomUUID();
        when(logRepo.findRetryable(any(), any(), any(Pageable.class)))
                .thenReturn(List.of(row(100L, jobId, "process:" + jobId + ":close", 4)));
        when(teamExtRepo.findAllById(any())).thenReturn(List.of(ext(100L, "cus_live", "sub_live")));

        scheduler(true).reconcile();

        verify(meterReportingService)
                .recordUsage(100L, "cus_live", 4, null, "process:" + jobId + ":close", jobId);
    }

    @Test
    void reconcile_teamUnsubscribedSince_isSkipped() {
        UUID jobId = UUID.randomUUID();
        when(logRepo.findRetryable(any(), any(), any(Pageable.class)))
                .thenReturn(List.of(row(100L, jobId, "process:" + jobId + ":close", 4)));
        // Customer still present but no live subscription → no longer billable.
        when(teamExtRepo.findAllById(any())).thenReturn(List.of(ext(100L, "cus_live", null)));

        scheduler(true).reconcile();

        verify(meterReportingService, never())
                .recordUsage(any(), any(), anyInt(), any(), any(), any());
    }

    @Test
    void reconcile_missingTeamExtensions_isSkipped() {
        UUID jobId = UUID.randomUUID();
        when(logRepo.findRetryable(any(), any(), any(Pageable.class)))
                .thenReturn(List.of(row(100L, jobId, "process:" + jobId + ":close", 4)));
        when(teamExtRepo.findAllById(any())).thenReturn(List.of());

        scheduler(true).reconcile();

        verify(meterReportingService, never())
                .recordUsage(any(), any(), anyInt(), any(), any(), any());
    }

    @Test
    void reconcile_disabled_isNoOp() {
        scheduler(false).reconcile();

        verifyNoInteractions(logRepo, teamExtRepo, meterReportingService);
    }
}
