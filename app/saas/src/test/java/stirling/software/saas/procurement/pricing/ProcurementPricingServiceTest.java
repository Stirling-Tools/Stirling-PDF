package stirling.software.saas.procurement.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import stirling.software.saas.procurement.pricing.QuoteLineItem.Kind;

/**
 * Locks the pricing engine to the numbers the marketing prototype encodes — most importantly the
 * canonical quote QT-AC9F-0001 (1M PDFs, priority, 3-year) = $41,400/yr, $124,200 TCV.
 */
class ProcurementPricingServiceTest {

    private final ProcurementPricingService pricing = new ProcurementPricingService();

    private static QuoteConfig cfg(long volume, String sla, int term) {
        return new QuoteConfig(volume, 0, "cloud", term, sla, false, false, false, "USD");
    }

    @Test
    void canonicalQuoteMatchesPrototype() {
        QuoteBreakdown q = pricing.price(cfg(1_000_000, "priority", 3));

        assertThat(q.annualNetMinor()).isEqualTo(4_140_000L); // $41,400
        assertThat(q.tcvMinor()).isEqualTo(12_420_000L); // $124,200
        assertThat(lineAmount(q, "usage")).isEqualTo(4_000_000L); // $40,000 @ $0.04
        assertThat(lineAmount(q, "service-level")).isEqualTo(600_000L); // +15%
        assertThat(lineAmount(q, "multi-year")).isEqualTo(-460_000L); // -10%
    }

    @Test
    void volumeBandsPickTheRightPerPdfRate() {
        assertThat(lineAmount(pricing.price(cfg(500_000, "standard", 1)), "usage"))
                .isEqualTo(2_500_000L); // 500k @ $0.05
        assertThat(lineAmount(pricing.price(cfg(1_000_000, "standard", 1)), "usage"))
                .isEqualTo(4_000_000L); // 1M @ $0.04
        assertThat(lineAmount(pricing.price(cfg(5_000_000, "standard", 1)), "usage"))
                .isEqualTo(15_000_000L); // 5M @ $0.03
    }

    @Test
    void addOnsAndTermStack() {
        QuoteConfig c =
                new QuoteConfig(1_000_000, 0, "cloud", 5, "dedicated", true, true, true, "USD");
        QuoteBreakdown q = pricing.price(c);

        long usage = 4_000_000L;
        long withSla = Math.round(usage * 1.30); // 5,200,000
        long withIndemnity = Math.round(withSla * 1.05); // 5,460,000
        long discount = Math.round(withIndemnity * 0.15); // 819,000
        long qbr = 800_000L;
        long expectedAnnual = (withIndemnity - discount) + qbr;
        long expectedTcv = expectedAnnual * 5 + 750_000L; // + training one-time

        assertThat(q.annualNetMinor()).isEqualTo(expectedAnnual);
        assertThat(q.tcvMinor()).isEqualTo(expectedTcv);
        assertThat(q.lineItems())
                .anyMatch(l -> l.key().equals("training") && l.kind() == Kind.ONE_TIME);
        assertThat(q.lineItems()).anyMatch(l -> l.key().equals("qbr"));
        assertThat(q.lineItems()).anyMatch(l -> l.key().equals("indemnification"));
    }

    @Test
    void standardSingleYearHasNoUpliftOrDiscountLines() {
        QuoteBreakdown q = pricing.price(cfg(1_000_000, "standard", 1));
        assertThat(q.annualNetMinor()).isEqualTo(4_000_000L);
        assertThat(q.tcvMinor()).isEqualTo(4_000_000L);
        assertThat(q.lineItems()).noneMatch(l -> l.key().equals("service-level"));
        assertThat(q.lineItems()).noneMatch(l -> l.key().equals("multi-year"));
    }

    @Test
    void volumeEstimateFromSeats() {
        // ~2,013 PDFs/user/yr
        assertThat(pricing.estimateAnnualVolume(100)).isEqualTo(201_250L);
        assertThat(pricing.estimateAnnualVolume(0)).isZero();
    }

    private static long lineAmount(QuoteBreakdown q, String key) {
        return q.lineItems().stream()
                .filter(l -> l.key().equals(key))
                .mapToLong(QuoteLineItem::amountMinor)
                .findFirst()
                .orElseThrow();
    }
}
