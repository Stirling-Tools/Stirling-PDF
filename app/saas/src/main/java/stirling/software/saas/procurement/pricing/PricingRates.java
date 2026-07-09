package stirling.software.saas.procurement.pricing;

/**
 * The enterprise rate card (D71): the inputs pricing derives a quote from. In production these are
 * read from the Stripe price mirror; {@link #defaults()} is the fallback used when the {@code
 * stripe} schema isn't synced (dev / tests) and is the single source of the numbers the marketing
 * prototype ({@code quotePricing}) encodes.
 *
 * <p>The meter is denominated in <b>runs</b> (a PDF running N policies is N runs). The per-run rate
 * is a fraction of a dollar, so it lives here as a {@code double} in dollars; flat and one-time
 * fees are whole-dollar amounts held in minor units (cents). See {@link ProcurementPricingService}
 * for how they combine.
 */
public record PricingRates(
        double listRatePerRun, // $0.01 list per run
        double floorRatePerRun, // $0.005 asymptotic floor (cost + margin)
        double discountPerDoubling, // 0.06 = 6% off the per-run rate per doubling past 1M runs/yr
        double[] termDiscountByYear, // meter-only discount; index 0 = 1yr … index 4 = 5yr
        double indemnificationRate, // fraction of the net meter (legal exposure scales with usage)
        long dedicatedSupportMinor, // flat: dedicated SE/CSM (standard + priority are included)
        long selfHostDeployMinor, // flat: self-hosted deployment
        long airgapDeployMinor, // flat: air-gapped deployment
        long qbrAnnualMinor, // flat: quarterly business reviews
        long trainingOneTimeMinor) { // one-time: onboarding & training

    public static PricingRates defaults() {
        return new PricingRates(
                0.01, // $0.01 / run list
                0.005, // $0.005 / run floor
                0.06, // 6% off per doubling of committed runs past 1M/yr
                new double[] {0.0, 0.03, 0.05, 0.06, 0.07}, // 1–5 year term, meter only
                0.05, // IP indemnification = 5% of the net meter
                3_000_000, // dedicated SE/CSM $30,000 / yr
                1_200_000, // self-hosted $12,000 / yr
                3_600_000, // air-gapped $36,000 / yr
                800_000, // QBRs $8,000 / yr
                750_000); // onboarding & training $7,500 one-time
    }

    public double termDiscount(int termYears) {
        int idx = Math.max(1, Math.min(termYears, 5)) - 1;
        return termDiscountByYear[idx];
    }
}
