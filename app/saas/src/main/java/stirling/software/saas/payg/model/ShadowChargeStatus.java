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
     * Set when the charge was released before it was metered: the request returned an error status,
     * or the policy run it belonged to failed. Nothing reached Stripe for this row.
     */
    REFUNDED
}
