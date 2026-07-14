package stirling.software.saas.payg.bundle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.bundle.PrepaidPurchaseService.PrepaidQuote;

/** Unit tests for the prepaid-bundle pricing + quote-ticket persistence. */
@ExtendWith(MockitoExtension.class)
class PrepaidPurchaseServiceTest {

    @Mock private PrepaidBundleQuoteRepository quoteRepository;
    @Mock private TeamBillingService billingService;

    private PrepaidPurchaseService service;

    private void init() {
        service = new PrepaidPurchaseService(quoteRepository, billingService);
    }

    /**
     * Stub the save to echo back the ticket with a generated id — for tests that reach persistence.
     */
    private void stubSave() {
        when(quoteRepository.save(any(PrepaidBundleQuote.class)))
                .thenAnswer(
                        inv -> {
                            PrepaidBundleQuote q = inv.getArgument(0);
                            q.setId(555L);
                            return q;
                        });
    }

    /** Billing facts with a known per-unit rate + currency — the subscribed / synced case. */
    private static TeamBillingContext billingWithRate(BigDecimal rate, String currency) {
        LocalDateTime start = LocalDateTime.now().withDayOfMonth(1);
        return new TeamBillingContext(
                true, "sub_x", start, start.plusMonths(1), 500L, 0L, rate, currency, null, null);
    }

    /** Billing facts with no resolvable rate — a free team before the Price has synced. */
    private static TeamBillingContext billingNoRate() {
        LocalDateTime start = LocalDateTime.now().withDayOfMonth(1);
        return new TeamBillingContext(
                false, null, start, start.plusMonths(1), 500L, 500L, null, null, null, null);
    }

    @Test
    void quote_withKnownRate_appliesTwelveForTenDiscount() {
        init();
        stubSave();
        when(billingService.forTeam(42L)).thenReturn(billingWithRate(BigDecimal.valueOf(2), "usd"));

        PrepaidQuote q = service.quote(42L, 120_000L);

        assertThat(q.quoteId()).isEqualTo(555L);
        assertThat(q.units()).isEqualTo(120_000L);
        assertThat(q.currency()).isEqualTo("usd");
        assertThat(q.unitAmountMinor()).isEqualByComparingTo(BigDecimal.valueOf(2));
        // 120k × 2 = 240,000 minor undiscounted; × 10/12 = 200,000 paid; saves 40,000.
        assertThat(q.listAmountMinor()).isEqualTo(240_000L);
        assertThat(q.totalAmountMinor()).isEqualTo(200_000L);
        assertThat(q.savingsMinor()).isEqualTo(40_000L);
        assertThat(q.monthsGranted()).isEqualTo(12);
        assertThat(q.monthsPaid()).isEqualTo(10);
    }

    @Test
    void quote_subCentRate_roundsToMinorUnit() {
        init();
        stubSave();
        // Half-cent per unit; 100,000 units → 50,000 minor list, × 10/12 = 41,667 (HALF_UP).
        when(billingService.forTeam(7L)).thenReturn(billingWithRate(new BigDecimal("0.5"), "gbp"));

        PrepaidQuote q = service.quote(7L, 100_000L);

        assertThat(q.currency()).isEqualTo("gbp");
        assertThat(q.listAmountMinor()).isEqualTo(50_000L);
        assertThat(q.totalAmountMinor()).isEqualTo(41_667L);
        assertThat(q.savingsMinor()).isEqualTo(8_333L);
    }

    @Test
    void quote_freeTeamNoRate_persistsWithNullMoneyAndFallbackCurrency() {
        init();
        stubSave();
        when(billingService.forTeam(9L)).thenReturn(billingNoRate());

        PrepaidQuote q = service.quote(9L, 50_000L);

        assertThat(q.quoteId()).isEqualTo(555L);
        assertThat(q.currency()).isEqualTo("usd"); // fallback — no Stripe currency yet
        assertThat(q.unitAmountMinor()).isNull();
        assertThat(q.listAmountMinor()).isNull();
        assertThat(q.totalAmountMinor()).isNull();
        assertThat(q.savingsMinor()).isNull();
    }

    @Test
    void quote_persistsTicketWithTtlAndInputs() {
        init();
        stubSave();
        when(billingService.forTeam(11L)).thenReturn(billingWithRate(BigDecimal.valueOf(2), "usd"));

        LocalDateTime before = LocalDateTime.now();
        service.quote(11L, 30_000L);
        LocalDateTime after = LocalDateTime.now();

        ArgumentCaptor<PrepaidBundleQuote> saved =
                ArgumentCaptor.forClass(PrepaidBundleQuote.class);
        verify(quoteRepository).save(saved.capture());
        PrepaidBundleQuote ticket = saved.getValue();
        assertThat(ticket.getTeamId()).isEqualTo(11L);
        assertThat(ticket.getUnits()).isEqualTo(30_000L);
        assertThat(ticket.getCurrency()).isEqualTo("usd");
        assertThat(ticket.getExpiresAt())
                .isBetween(
                        before.plus(PrepaidPurchaseService.QUOTE_TTL).minusSeconds(5),
                        after.plus(PrepaidPurchaseService.QUOTE_TTL).plusSeconds(5));
    }

    @Test
    void quote_belowMinimum_isRejected() {
        init();

        assertThatThrownBy(() -> service.quote(1L, 0L))
                .isInstanceOf(IllegalArgumentException.class);
        verify(quoteRepository, never()).save(any());
    }

    @Test
    void quote_aboveMaximum_isRejected() {
        init();

        assertThatThrownBy(() -> service.quote(1L, PrepaidPurchaseService.MAX_UNITS + 1))
                .isInstanceOf(IllegalArgumentException.class);
        verify(quoteRepository, never()).save(any());
    }
}
