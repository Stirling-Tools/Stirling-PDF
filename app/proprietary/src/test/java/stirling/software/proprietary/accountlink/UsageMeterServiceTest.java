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
        service = new UsageMeterService(repo, signatureRepo);
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
    void claimsNewSignatureThenAccrues() {
        when(repo.increment(eq(period), eq("AI"), eq(5L), any())).thenReturn(1);

        service.accrue(period, BillingCategory.AI, 5, "op-sig-new");

        verify(signatureRepo).saveAndFlush(any(MeteredInputSignature.class));
        verify(repo).increment(eq(period), eq("AI"), eq(5L), any());
    }

    @Test
    void skipsAccrualWhenSignatureAlreadyClaimed() {
        // Re-submission of the identical input set → signature claim fails → not re-charged.
        when(signatureRepo.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("dup"));

        service.accrue(period, BillingCategory.AI, 5, "op-sig-dup");

        verify(repo, never()).increment(any(), any(), anyLong(), any());
        verify(repo, never()).saveAndFlush(any());
    }
}
