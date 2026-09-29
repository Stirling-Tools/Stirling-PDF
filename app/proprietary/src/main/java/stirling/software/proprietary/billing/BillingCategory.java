package stirling.software.proprietary.billing;

/**
 * The billing / analytics axis for a metered operation. PAYG runs on a single flat-priced meter, so
 * category is metadata only and never affects price.
 *
 * <p>Classification precedence is {@code AUTOMATION → AI → API → BYPASSED} (see {@link
 * BillingCategoryClassifier}); {@link #BYPASSED} is a manual interactive tool call that is never
 * billed.
 *
 * <p>Mirrors the value set of the SaaS {@code payg.model.BillingCategory}. A linked self-hosted
 * instance reports usage per category to SaaS as the lower-case names ({@code api} / {@code ai} /
 * {@code automation}) in the daily sync, and SaaS maps them back — so the two enums must keep the
 * same names. (We deliberately do not share one enum across the modules: that would drag the SaaS
 * billing enum through ~20 hot-path files for what is JSON-string metadata on the wire.)
 */
public enum BillingCategory {
    BYPASSED,
    API,
    AI,
    AUTOMATION
}
