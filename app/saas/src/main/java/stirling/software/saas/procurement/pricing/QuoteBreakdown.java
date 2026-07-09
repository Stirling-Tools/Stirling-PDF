package stirling.software.saas.procurement.pricing;

import java.util.List;

/**
 * The priced result of a {@link QuoteConfig}: the itemised lines plus the two headline figures the
 * order form and Stripe checkout are built from. {@code annualNetMinor} is the recurring annual fee
 * after the multi-year discount; {@code tcvMinor} is total contract value across the term including
 * one-time fees. Minor units (cents).
 */
public record QuoteBreakdown(
        List<QuoteLineItem> lineItems, long annualNetMinor, long tcvMinor, String currency) {}
