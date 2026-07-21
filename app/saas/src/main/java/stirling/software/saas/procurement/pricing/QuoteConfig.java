package stirling.software.saas.procurement.pricing;

/**
 * The buyer-configurable inputs to an enterprise quote. Mirrors the quote builder's four steps
 * (volume, commitment &amp; service, add-ons) and is the sole input to {@link
 * ProcurementPricingService}. Amounts are never carried here — the service derives them from these
 * choices and the rate card.
 */
public record QuoteConfig(
        long volume, // committed PDFs per year
        int users, // seats (drives the volume auto-estimate when the buyer hasn't overridden)
        int intensity, // policy posture: runs per PDF — Essentials 2, Governed 4, Regulated 7
        double sizeMult, // file-size tier multiplier on the rate — Compact 1.0 / Standard 1.4 /
        // Heavy 2.4
        String deployment, // cloud | selfhost | airgap (priced flat; inherited from the trial)
        int termYears, // 1..5
        String serviceLevel, // standard | priority (both included) | dedicated (flat SE/CSM fee)
        boolean indemnification,
        boolean training,
        boolean qbr,
        String currency) { // USD only for now

    /** Default posture when none is chosen — Governed (x4), per the pricing alignment decision. */
    public static final int DEFAULT_INTENSITY = 4;

    /** Known file-size tier multipliers (D93): Compact 1.0, Standard 1.4, Heavy 2.4. */
    private static final double[] SIZE_MULTS = {1.0, 1.4, 2.4};

    public QuoteConfig {
        if (termYears < 1) termYears = 1;
        if (termYears > 5) termYears = 5;
        if (intensity < 1) intensity = DEFAULT_INTENSITY;
        if (serviceLevel == null || serviceLevel.isBlank()) serviceLevel = "standard";
        if (currency == null || currency.isBlank()) currency = "USD";
        // Snap the file-size multiplier to a known tier so a tampered request can't invent a
        // cheaper
        // one; absent (0.0) or unknown falls back to 1.0 (no uplift).
        double snapped = 1.0;
        for (double s : SIZE_MULTS) {
            if (Math.abs(s - sizeMult) < 1e-9) snapped = s;
        }
        sizeMult = snapped;
    }
}
