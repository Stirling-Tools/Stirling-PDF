package stirling.software.saas.procurement.pricing;

/**
 * The enterprise rate card: the inputs pricing multiplies against. In production these are read
 * from the Stripe price mirror (see {@code StripeMirrorPriceCatalog}); {@link #defaults()} is the
 * fallback used when the {@code stripe} schema isn't synced (dev / tests) and is the single source
 * of the numbers the marketing prototype encodes.
 *
 * <p>Per-PDF rates are in minor units (cents) per document. Multipliers are fractions (e.g. 0.15 =
 * +15%). Flat/one-time fees are in minor units.
 */
public record PricingRates(
        long perPdfMinorUnder1M,
        long perPdfMinorUnder5M,
        long perPdfMinor5MPlus,
        double priorityUplift,
        double dedicatedUplift,
        double indemnificationUplift,
        double[] termDiscountByYear, // index 0 = 1yr … index 4 = 5yr
        long qbrAnnualMinor,
        long trainingOneTimeMinor,
        long offlineLicenseAnnualMinor) {

    public static PricingRates defaults() {
        return new PricingRates(
                5, // $0.05 / PDF under 1M/yr
                4, // $0.04 / PDF at 1M–5M/yr
                3, // $0.03 / PDF at 5M+/yr
                0.15, // priority +15%
                0.30, // dedicated +30%
                0.05, // IP indemnification +5%
                new double[] {0.0, 0.05, 0.10, 0.12, 0.15},
                800_000, // QBRs $8,000 / yr
                750_000, // onboarding & training $7,500 one-time
                1_200_000); // offline/air-gapped licence $12,000 / yr
    }

    /** Volume-banded per-PDF rate for an annual volume, in minor units. */
    public long perPdfMinor(long annualVolume) {
        if (annualVolume >= 5_000_000) return perPdfMinor5MPlus;
        if (annualVolume >= 1_000_000) return perPdfMinorUnder5M;
        return perPdfMinorUnder1M;
    }

    public double termDiscount(int termYears) {
        int idx = Math.max(1, Math.min(termYears, 5)) - 1;
        return termDiscountByYear[idx];
    }

    public double serviceLevelUplift(String serviceLevel) {
        if ("priority".equalsIgnoreCase(serviceLevel)) return priorityUplift;
        if ("dedicated".equalsIgnoreCase(serviceLevel)) return dedicatedUplift;
        return 0.0;
    }
}
