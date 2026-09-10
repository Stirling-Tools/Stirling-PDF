package stirling.software.proprietary.accountlink;

/**
 * Outcome of {@link InstanceEntitlementGate}. {@link #allowed} is what the interceptor enforces;
 * {@link #reason} is the only thing distinguishing "your grant is spent, linking buys more" from
 * "your linked team is over its limit". Allows carry one too, informationally.
 */
public record GateDecision(boolean allowed, Reason reason) {

    public enum Reason {
        /** Feature flag is off — gate is fully inert. */
        FLAG_OFF,
        /** Operation is a manual tool — always free, never gated. */
        MANUAL_FREE,
        /** Linked + within entitlement — billable work allowed. */
        ENTITLED,
        FREE_TIER,
        /** Entitlement source unreachable — fail open, allow. */
        FAIL_OPEN,
        /**
         * Linked + metering, but SaaS has been unreachable past the grace window — block (the
         * fail-open backstop expired) so unbounded free/unbilled billable work can't continue.
         */
        GRACE_EXPIRED,
        /**
         * Blocked until the period rolls. The FE must offer linking as <em>more</em> allowance, not
         * as what switches the feature on: nothing here needed an account.
         */
        FREE_TIER_EXHAUSTED,
        /** Linked but over the limit / no subscription — block billable work. */
        OVER_LIMIT,
        /** Credential revoked/invalid on the SaaS side — block billable work. */
        REVOKED
    }

    public static GateDecision allow(Reason reason) {
        return new GateDecision(true, reason);
    }

    public static GateDecision block(Reason reason) {
        return new GateDecision(false, reason);
    }
}
