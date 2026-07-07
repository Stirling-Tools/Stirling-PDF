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
        String deployment, // cloud | selfhost | airgap (inherited from the trial; not priced)
        int termYears, // 1..5
        String serviceLevel, // standard | priority | dedicated
        boolean indemnification,
        boolean training,
        boolean qbr,
        boolean offlineLicense, // air-gapped/offline licence file — a paid add-on
        String currency) { // USD | EUR | GBP

    public QuoteConfig {
        if (termYears < 1) termYears = 1;
        if (termYears > 5) termYears = 5;
        if (serviceLevel == null || serviceLevel.isBlank()) serviceLevel = "standard";
        if (currency == null || currency.isBlank()) currency = "USD";
    }
}
