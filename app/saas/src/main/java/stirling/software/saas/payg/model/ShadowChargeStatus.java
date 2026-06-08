package stirling.software.saas.payg.model;

/**
 * Lifecycle state for a {@code payg_shadow_charge} row. Mimics the Stripe meter_event_adjustment
 * (type=cancel) mechanism that real-mode will invoke when a freshly-opened process fails on its
 * first step. The reconciliation report's "true net" query is {@code SUM(payg_units) WHERE status =
 * 'CHARGED'}.
 */
public enum ShadowChargeStatus {
    /** Default at process open; the would-be charge stands. */
    CHARGED,
    /**
     * Set when a 5xx first-step failure was observed in the same request's {@code afterCompletion}.
     * Real-mode equivalent is a successful Stripe {@code meter_event_adjustment} posted in the same
     * transaction-after-commit hook.
     */
    REFUNDED
}
