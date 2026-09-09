package stirling.software.proprietary.accountlink;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import stirling.software.proprietary.billing.BillingCategory;

@ExtendWith(MockitoExtension.class)
class UsageMeterServiceTest {

    @Mock private UsageCounterRepository repo;
    @Mock private MeteredInputSignatureRepository signatureRepo;

    private UsageMeterService service;
    private final LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);

    @BeforeEach
    void setUp() {
        service = new UsageMeterService(repo, signatureRepo, new AccountLinkProperties());
    }

    @Test
    void incrementsExistingCounter() {
        when(repo.increment(eq(period), eq("AI"), eq(5L), any())).thenReturn(1);

        service.accrue(period, BillingCategory.AI, 5, null);

        verify(repo).increment(eq(period), eq("AI"), eq(5L), any());
        verify(repo, never()).saveAndFlush(any());
    }

    @Test
    void insertsWhenNoRowExists() {
        when(repo.increment(eq(period), eq("API"), eq(3L), any())).thenReturn(0);

        service.accrue(period, BillingCategory.API, 3, null);

        verify(repo).saveAndFlush(any(UsageCounter.class));
    }

    @Test
    void retriesIncrementWhenInsertLosesRace() {
        // First increment misses (no row); insert loses the race to a concurrent thread; the
        // second increment then succeeds against the row that thread created.
        when(repo.increment(eq(period), eq("AUTOMATION"), eq(2L), any())).thenReturn(0, 1);
        when(repo.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("dup"));

        service.accrue(period, BillingCategory.AUTOMATION, 2, null);

        verify(repo, times(2)).increment(eq(period), eq("AUTOMATION"), eq(2L), any());
    }

    @Test
    void skipsBypassedNonPositiveAndNullPeriod() {
        service.accrue(period, BillingCategory.BYPASSED, 5, null);
        service.accrue(period, BillingCategory.AI, 0, null);
        service.accrue(null, BillingCategory.AI, 5, null);

        verifyNoInteractions(repo, signatureRepo);
    }

    @Test
    void chargesNewSignatureThenAccrues() {
        when(signatureRepo.findByPeriodStartAndSignature(period, "op-sig-new"))
                .thenReturn(Optional.empty());
        when(repo.increment(eq(period), eq("AI"), eq(5L), any())).thenReturn(1);

        service.accrue(period, BillingCategory.AI, 5, "op-sig-new");

        verify(signatureRepo).saveAndFlush(any(MeteredInputSignature.class));
        verify(repo).increment(eq(period), eq("AI"), eq(5L), any());
    }

    @Test
    void skipsConcurrentDuplicateClaim() {
        // Unseen this period, but a concurrent op wins the insert first → treated as within-window
        // chaining, not re-charged.
        when(signatureRepo.findByPeriodStartAndSignature(period, "op-sig-race"))
                .thenReturn(Optional.empty());
        when(signatureRepo.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("dup"));

        service.accrue(period, BillingCategory.AI, 5, "op-sig-race");

        verify(repo, never()).increment(any(), any(), anyLong(), any());
        verify(repo, never()).saveAndFlush(any());
    }

    @Test
    void skipsRepeatWithinWorkflowWindow() {
        // Same input set seen moments ago → chaining → not re-charged; the window slides.
        MeteredInputSignature recent =
                new MeteredInputSignature(period, "op-sig", LocalDateTime.now());
        when(signatureRepo.findByPeriodStartAndSignature(period, "op-sig"))
                .thenReturn(Optional.of(recent));

        service.accrue(period, BillingCategory.AI, 5, "op-sig");

        verify(repo, never()).increment(any(), any(), anyLong(), any());
        verify(signatureRepo).save(recent); // window touched
    }

    @Test
    void chargesRepeatOutsideWorkflowWindow() {
        // Same input set last seen well past the 5-minute window → an independent re-run → charged.
        MeteredInputSignature stale =
                new MeteredInputSignature(period, "op-sig", LocalDateTime.now().minusMinutes(10));
        when(signatureRepo.findByPeriodStartAndSignature(period, "op-sig"))
                .thenReturn(Optional.of(stale));
        when(repo.increment(eq(period), eq("AI"), eq(5L), any())).thenReturn(1);

        service.accrue(period, BillingCategory.AI, 5, "op-sig");

        verify(repo).increment(eq(period), eq("AI"), eq(5L), any());
        verify(signatureRepo).save(stale); // window touched
    }
}
