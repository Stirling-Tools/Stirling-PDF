package stirling.software.saas.procurement.pricing;

import java.util.List;

/**
 * The priced result of a {@link QuoteConfig}: the itemised lines plus the headline figures the
 * order form and Stripe checkout are built from. {@code annualNetMinor} is the recurring annual fee
 * after the multi-year discount; {@code tcvMinor} is total contract value across the committed term
 * including one-time fees; {@code renewalAnnualNetMinor} is the annual fee at the first post-term
 * renewal after the fixed CPI escalator (the committed term itself is flat). Minor units (cents).
 */
public record QuoteBreakdown(
        List<QuoteLineItem> lineItems,
        long annualNetMinor,
        long tcvMinor,
        long renewalAnnualNetMinor,
        String currency) {}
