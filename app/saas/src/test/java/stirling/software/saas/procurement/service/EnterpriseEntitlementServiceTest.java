package stirling.software.saas.procurement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import stirling.software.saas.procurement.model.ProcurementDeal;
import stirling.software.saas.procurement.model.ProcurementQuote;
import stirling.software.saas.procurement.repository.ProcurementDealRepository;
import stirling.software.saas.procurement.repository.ProcurementQuoteRepository;

class EnterpriseEntitlementServiceTest {
    private final ProcurementDealRepository deals = mock(ProcurementDealRepository.class);
    private final ProcurementQuoteRepository quotes = mock(ProcurementQuoteRepository.class);
    private final EnterpriseEntitlementService service =
            new EnterpriseEntitlementService(deals, quotes);
    private final LocalDateTime now = LocalDateTime.of(2026, 10, 12, 12, 0);

    private ProcurementDeal trial() {
        ProcurementDeal deal = new ProcurementDeal(7L);
        deal.setDealId(3L);
        deal.setTrialStartedAt(now.minusDays(7));
        deal.setTrialEndsAt(now.plusDays(7));
        deal.setSeats(100);
        return deal;
    }

    @Test
    void trialSurvivesQuoteAndAgreementAndExpiresAtExactBoundary() {
        ProcurementDeal deal = trial();
        for (String stage : new String[] {"trial", "quote", "security"}) {
            deal.setStage(stage);
            assertThat(service.resolve(deal, now))
                    .get()
                    .extracting(EnterpriseEntitlementService.Entitlement::status)
                    .isEqualTo("trial");
        }
        assertThat(service.resolve(deal, deal.getTrialEndsAt())).isEmpty();
        assertThat(service.resolve(deal, deal.getTrialStartedAt().minusSeconds(1))).isEmpty();
    }

    @Test
    void paidAccessUsesAcceptedQuoteAndDoesNotFallbackToTrialWhenItEnds() {
        ProcurementDeal deal = trial();
        deal.setStage("active");
        deal.setAcceptedQuoteId(9L);
        deal.setEnterprisePeriodStart(now.minusDays(1));
        deal.setEnterprisePeriodEnd(now.plusYears(1));
        deal.setEnterpriseAccessUntil(now.plusDays(1));
        ProcurementQuote quote = new ProcurementQuote();
        quote.setDealId(3L);
        quote.setSeats(20);
        quote.setVolume(50000);
        when(quotes.findById(9L)).thenReturn(Optional.of(quote));
        var result = service.resolve(deal, now).orElseThrow();
        assertThat(result.agreedSeats()).isEqualTo(20);
        assertThat(result.annualVolume()).isEqualTo(50000);
        assertThat(service.resolve(deal, now.plusDays(1))).isEmpty();
        quote.setDealId(99L);
        assertThat(service.resolve(deal, now)).isEmpty();
    }
}
