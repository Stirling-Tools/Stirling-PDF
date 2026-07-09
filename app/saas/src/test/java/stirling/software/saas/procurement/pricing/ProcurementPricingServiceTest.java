package stirling.software.saas.procurement.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import stirling.software.saas.procurement.pricing.QuoteLineItem.Kind;

/**
 * Locks the D71 pricing engine to the numbers marketing publishes. The two anchor fixtures are the
 * ones the demo memo foots against: acme (90M PDFs · Governed · self-hosted · dedicated · 3-yr =
 * $1,752,000/yr, $5,256,000 TCV) and Northwind (6M · Governed · cloud · standard · 3-yr =
 * $165,278/yr). If either moves, the engine has drifted from marketing.
 */
class ProcurementPricingServiceTest {

    private final ProcurementPricingService pricing = new ProcurementPricingService();

    private static QuoteConfig cfg(
            long volume, int intensity, String deployment, int term, String sla) {
        return new QuoteConfig(
                volume, 0, intensity, deployment, term, sla, false, false, false, false, "USD");
    }

    @Test
    void acmeFixtureFootsExactly() {
        // 90M PDFs × Governed(×4) = 360M runs → curve floors at $0.005/run → $0.0200/PDF effective.
        // meter $1.8M − 5% (3-yr) = $1,710,000 + self-hosted $12K + dedicated SE/CSM $30K.
        QuoteBreakdown q = pricing.price(cfg(90_000_000, 4, "selfhost", 3, "dedicated"));

        assertThat(q.annualNetMinor()).isEqualTo(175_200_000L); // $1,752,000
        assertThat(q.tcvMinor()).isEqualTo(525_600_000L); // $5,256,000
        assertThat(q.renewalAnnualNetMinor()).isEqualTo(180_456_000L); // $1,752,000 + 3% CPI
        assertThat(lineAmount(q, "support")).isEqualTo(3_000_000L); // dedicated SE/CSM $30K
        assertThat(lineAmount(q, "deployment")).isEqualTo(1_200_000L); // self-hosted $12K
    }

    @Test
    void northwindFixtureFootsExactly() {
        // 6M × Governed(×4) = 24M runs → $0.0290/PDF effective → $165,278/yr at 3-yr.
        QuoteBreakdown q = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard"));

        assertThat(q.annualNetMinor()).isEqualTo(16_527_800L); // $165,278
        assertThat(q.tcvMinor()).isEqualTo(49_583_400L); // × 3 years
        // Cloud + standard: no deployment or support line.
        assertThat(q.lineItems()).noneMatch(l -> l.key().equals("deployment"));
        assertThat(q.lineItems()).noneMatch(l -> l.key().equals("support"));
    }

    @Test
    void renewalAppliesCpiEscalatorAfterAFlatTerm() {
        // The committed term is flat (TCV = annual × years, asserted above). The 3% CPI escalator
        // describes only the first post-term renewal: annual + one 3% step. It never touches TCV.
        QuoteBreakdown q = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard"));
        assertThat(q.renewalAnnualNetMinor())
                .isEqualTo(Math.round(q.annualNetMinor() * 1.03)); // 16,527,800 → 17,023,634
        assertThat(q.tcvMinor()).isEqualTo(q.annualNetMinor() * 3); // renewal is outside the TCV
        assertThat(pricing.cpiRatePct()).isEqualTo(3);
        assertThat(pricing.renewalAnnualMinor(q.annualNetMinor()))
                .isEqualTo(q.renewalAnnualNetMinor()); // stored-quote echo agrees with pricing
    }

    @Test
    void rateFloorsAtHalfACent() {
        // 100M × Regulated(×7) = 700M runs — deep past the knee, so the per-run rate is pinned to
        // the $0.005 floor: base meter = 700M × $0.005 = $3,500,000 (1-yr, no term discount).
        QuoteBreakdown q = pricing.price(cfg(100_000_000, 7, "cloud", 1, "standard"));
        assertThat(lineAmount(q, "usage")).isEqualTo(350_000_000L); // $3,500,000
        assertThat(q.annualNetMinor()).isEqualTo(350_000_000L);
    }

    @Test
    void postureDrivesThePrice() {
        // Same PDFs, three postures — the meter scales with runs, so Regulated > Governed >
        // Essentials. (This is what the retired flat-per-PDF model could not express.)
        long essentials = pricing.price(cfg(6_000_000, 2, "cloud", 3, "standard")).annualNetMinor();
        long governed = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard")).annualNetMinor();
        long regulated = pricing.price(cfg(6_000_000, 7, "cloud", 3, "standard")).annualNetMinor();

        assertThat(essentials).isLessThan(governed);
        assertThat(governed).isLessThan(regulated);
        assertThat(governed).isEqualTo(16_527_800L); // Governed is the Northwind anchor
    }

    @Test
    void deploymentIsAFlatFeeNotAMultiplier() {
        long cloud = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard")).annualNetMinor();
        long selfhost =
                pricing.price(cfg(6_000_000, 4, "selfhost", 3, "standard")).annualNetMinor();
        long airgap = pricing.price(cfg(6_000_000, 4, "airgap", 3, "standard")).annualNetMinor();

        assertThat(selfhost - cloud).isEqualTo(1_200_000L); // +$12,000 flat
        assertThat(airgap - cloud).isEqualTo(3_600_000L); // +$36,000 flat
    }

    @Test
    void standardAndPriorityIncludedDedicatedIsFlat() {
        long standard = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard")).annualNetMinor();
        long priority = pricing.price(cfg(6_000_000, 4, "cloud", 3, "priority")).annualNetMinor();
        long dedicated = pricing.price(cfg(6_000_000, 4, "cloud", 3, "dedicated")).annualNetMinor();

        assertThat(priority).isEqualTo(standard); // both included, no uplift
        assertThat(dedicated - standard).isEqualTo(3_000_000L); // dedicated SE/CSM +$30,000 flat
    }

    @Test
    void termDiscountsTheMeterOnly() {
        long oneYear = pricing.price(cfg(6_000_000, 4, "cloud", 1, "standard")).annualNetMinor();
        long twoYear = pricing.price(cfg(6_000_000, 4, "cloud", 2, "standard")).annualNetMinor();
        // 2-yr is 3% off the meter (discounted on the raw meter, then rounded to whole dollars).
        assertThat(oneYear).isEqualTo(17_397_700L); // no discount
        assertThat(twoYear).isEqualTo(16_875_700L); // −3% on the meter
        assertThat(twoYear).isLessThan(oneYear);
    }

    @Test
    void indemnificationIsFivePercentOfTheMeter() {
        long base = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard")).annualNetMinor();
        QuoteConfig c =
                new QuoteConfig(
                        6_000_000, 0, 4, "cloud", 3, "standard", true, false, false, false, "USD");
        QuoteBreakdown q = pricing.price(c);
        assertThat(lineAmount(q, "indemnification")).isEqualTo(Math.round(base * 0.05));
    }

    @Test
    void trainingIsOneTimeOutsideTheAnnual() {
        QuoteConfig withTraining =
                new QuoteConfig(
                        6_000_000, 0, 4, "cloud", 3, "standard", false, true, false, false, "USD");
        QuoteBreakdown q = pricing.price(withTraining);
        long baseAnnual = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard")).annualNetMinor();

        assertThat(q.annualNetMinor()).isEqualTo(baseAnnual); // one-time never touches the annual
        assertThat(q.tcvMinor()).isEqualTo(baseAnnual * 3 + 750_000L); // + $7,500 once
        assertThat(q.lineItems())
                .anyMatch(l -> l.key().equals("training") && l.kind() == Kind.ONE_TIME);
    }

    @Test
    void unsetPostureDefaultsToGoverned() {
        long defaulted = pricing.price(cfg(6_000_000, 0, "cloud", 3, "standard")).annualNetMinor();
        long governed = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard")).annualNetMinor();
        assertThat(defaulted).isEqualTo(governed);
    }

    @Test
    void ssoIsAlwaysAnIncludedZeroLine() {
        QuoteBreakdown q = pricing.price(cfg(6_000_000, 4, "cloud", 3, "standard"));
        assertThat(q.lineItems())
                .anyMatch(l -> l.key().equals("seats") && l.kind() == Kind.INCLUDED);
    }

    @Test
    void volumeEstimateFromSeats() {
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
