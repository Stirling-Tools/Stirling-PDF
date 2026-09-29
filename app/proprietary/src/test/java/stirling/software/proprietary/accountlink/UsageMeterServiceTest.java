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
        when(repo.increment(eq(period), eq("AI"), eq(5L), any())).thenReturn(1);

        service.accrue(period, BillingCategory.AI, 5, "op-sig-new");

        verify(signatureRepo).saveAndFlush(any(MeteredInputSignature.class));
        verify(repo).increment(eq(period), eq("AI"), eq(5L), any());
    }

    @Test
    void countsSuccessfulStepWhenAnotherCompletionWinsTheInsert() {
        when(signatureRepo.findByPeriodStartAndSignature(period, "op-sig-race"))
                .thenReturn(
                        Optional.of(
                                new MeteredInputSignature(
                                        period, "op-sig-race", LocalDateTime.now())));
        when(signatureRepo.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("dup"));
        when(signatureRepo.joinIfWithinLimit(eq(period), eq("op-sig-race"), any(), any(), eq(10)))
                .thenReturn(0, 1);

        service.accrue(period, BillingCategory.AI, 5, "op-sig-race");

        verify(repo, never()).increment(any(), any(), anyLong(), any());
        verify(repo, never()).saveAndFlush(any());
        verify(signatureRepo, times(2))
                .joinIfWithinLimit(eq(period), eq("op-sig-race"), any(), any(), eq(10));
    }

    @Test
    void skipsRepeatWithinWorkflowWindow() {
        when(signatureRepo.joinIfWithinLimit(eq(period), eq("op-sig"), any(), any(), eq(10)))
                .thenReturn(1);

        service.accrue(period, BillingCategory.AI, 5, "op-sig");

        verify(repo, never()).increment(any(), any(), anyLong(), any());
        verify(signatureRepo, never()).saveAndFlush(any());
    }

    @Test
    void chargesRepeatOutsideWorkflowWindow() {
        when(signatureRepo.restartIfFullOrExpired(eq(period), eq("op-sig"), any(), any(), eq(10)))
                .thenReturn(1);
        when(repo.increment(eq(period), eq("AI"), eq(5L), any())).thenReturn(1);

        service.accrue(period, BillingCategory.AI, 5, "op-sig");

        verify(repo).increment(eq(period), eq("AI"), eq(5L), any());
        verify(signatureRepo, never()).saveAndFlush(any());
    }

    @Test
    void doesNotRetryUnrelatedIntegrityFailures() {
        when(signatureRepo.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("invalid key"));
        when(repo.increment(eq(period), eq("AUTOMATION"), eq(5L), any())).thenReturn(1);

        service.accrue(period, BillingCategory.AUTOMATION, 5, "invalid-key", 20);

        verify(signatureRepo).saveAndFlush(any());
        verify(repo).increment(eq(period), eq("AUTOMATION"), eq(5L), any());
    }
}
