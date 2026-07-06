package stirling.software.saas.payg.instance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.repository.PaygInstanceUsageRepository;

@ExtendWith(MockitoExtension.class)
class InstanceUsageIngestServiceTest {

    @Mock private PaygInstanceUsageRepository repo;
    @Mock private JobChargeService chargeService;

    private InstanceUsageIngestService service;
    private final LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);

    @BeforeEach
    void setUp() {
        service = new InstanceUsageIngestService(repo, chargeService);
    }

    @Test
    void firstSyncChargesFullCumulativeAndSavesRow() {
        when(repo.findByTeamIdAndPeriodStartAndCategoryForUpdate(1L, period, "AI"))
                .thenReturn(Optional.empty());

        service.ingest(1L, 7L, 1L, period, Map.of(BillingCategory.AI, 10L));

        ArgumentCaptor<ChargeContext> ctx = ArgumentCaptor.forClass(ChargeContext.class);
        verify(chargeService).chargeStandalone(ctx.capture(), eq(10));
        assertThat(ctx.getValue().ownerTeamId()).isEqualTo(1L);
        assertThat(ctx.getValue().ownerUserId()).isEqualTo(7L);
        assertThat(ctx.getValue().billingCategory()).isEqualTo(BillingCategory.AI);
        assertThat(ctx.getValue().source()).isEqualTo(JobSource.LINKED_INSTANCE);

        ArgumentCaptor<PaygInstanceUsage> row = ArgumentCaptor.forClass(PaygInstanceUsage.class);
        verify(repo).save(row.capture());
        assertThat(row.getValue().getLastCumulativeUnits()).isEqualTo(10L);
        assertThat(row.getValue().getLastSyncSeq()).isEqualTo(1L);
    }

    @Test
    void secondSyncChargesOnlyDelta() {
        PaygInstanceUsage existing = new PaygInstanceUsage(1L, period, "API", 10L, 1L);
        when(repo.findByTeamIdAndPeriodStartAndCategoryForUpdate(1L, period, "API"))
                .thenReturn(Optional.of(existing));

        service.ingest(1L, 7L, 2L, period, Map.of(BillingCategory.API, 25L));

        // One charge for the aggregated delta (15), not per underlying op — pins the per-delta
        // model.
        verify(chargeService).chargeStandalone(any(ChargeContext.class), eq(15));
        verify(repo).save(existing);
        assertThat(existing.getLastCumulativeUnits()).isEqualTo(25L);
        assertThat(existing.getLastSyncSeq()).isEqualTo(2L);
    }

    @Test
    void replayIsIgnored() {
        PaygInstanceUsage existing = new PaygInstanceUsage(1L, period, "API", 25L, 2L);
        when(repo.findByTeamIdAndPeriodStartAndCategoryForUpdate(1L, period, "API"))
                .thenReturn(Optional.of(existing));

        service.ingest(1L, 7L, 2L, period, Map.of(BillingCategory.API, 25L));

        verify(chargeService, never()).chargeStandalone(any(), anyInt());
        verify(repo, never()).save(any());
    }

    @Test
    void regressionIsRefusedAndNotAdvanced() {
        PaygInstanceUsage existing = new PaygInstanceUsage(1L, period, "API", 25L, 2L);
        when(repo.findByTeamIdAndPeriodStartAndCategoryForUpdate(1L, period, "API"))
                .thenReturn(Optional.of(existing));

        service.ingest(1L, 7L, 3L, period, Map.of(BillingCategory.API, 5L));

        verify(chargeService, never()).chargeStandalone(any(), anyInt());
        verify(repo, never()).save(any());
    }

    @Test
    void zeroDeltaAdvancesSeqWithoutCharging() {
        PaygInstanceUsage existing = new PaygInstanceUsage(1L, period, "API", 25L, 2L);
        when(repo.findByTeamIdAndPeriodStartAndCategoryForUpdate(1L, period, "API"))
                .thenReturn(Optional.of(existing));

        service.ingest(1L, 7L, 3L, period, Map.of(BillingCategory.API, 25L));

        verify(chargeService, never()).chargeStandalone(any(), anyInt());
        verify(repo).save(existing);
        assertThat(existing.getLastSyncSeq()).isEqualTo(3L);
    }

    @Test
    void billsAccruedDeltaWithoutConsultingCap() {
        // Intent pin: the ingest has no cap input and always bills the accrued delta — cap
        // enforcement is the request-time gate's job (the instance stops accruing at the cap), not
        // this aggregate charge path's. A large valid delta is billed in full.
        when(repo.findByTeamIdAndPeriodStartAndCategoryForUpdate(1L, period, "API"))
                .thenReturn(Optional.empty());

        service.ingest(1L, 7L, 1L, period, Map.of(BillingCategory.API, 5_000_000L));

        verify(chargeService).chargeStandalone(any(ChargeContext.class), eq(5_000_000));
    }

    @Test
    void nullActorSkipsEntirely() {
        service.ingest(1L, null, 1L, period, Map.of(BillingCategory.AI, 10L));

        verifyNoInteractions(repo, chargeService);
    }
}
