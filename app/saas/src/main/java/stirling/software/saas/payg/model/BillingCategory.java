package stirling.software.saas.payg.model;

/**
 * Analytics / in-app breakdown axis stamped on every billable ledger entry and shadow charge. PAYG
 * stays on a single flat-priced Stripe meter — category is metadata only, never affects pricing.
 *
 * <p>Precedence at translation time (interceptor): AUTOMATION → AI → API → BYPASSED. {@link
 * #BYPASSED} is the default for manual UI tool calls that never hit a billable code path.
 *
 * <p>Listing order matters only as the default sentinel ({@link #BYPASSED} first); no downstream
 * relies on {@code ordinal()}.
 */
public enum BillingCategory {
    BYPASSED,
    API,
    AI,
    AUTOMATION
}
