package stirling.software.proprietary.accountlink;

/**
 * Outcome of {@link InstanceEntitlementGate}. {@link #allowed} is what the interceptor enforces;
 * {@link #reason} carries the machine-readable signal the FE maps to a prompt, and is the only
 * thing that distinguishes "your monthly allowance is spent, linking buys more" from "your linked
 * team is over its limit". Manual-tool, free-tier and fail-open allows carry an informational
 * reason but never block.
 */
public record GateDecision(boolean allowed, Reason reason) {

    public enum Reason {
        /** Feature flag is off — gate is fully inert. */
        FLAG_OFF,
        /** Operation is a manual tool — always free, never gated. */
        MANUAL_FREE,
        /** Linked + within entitlement — billable work allowed. */
        ENTITLED,
        /** Unlinked + inside the instance's own monthly grant — allowed, metered locally. */
        FREE_TIER,
        /** Entitlement source unreachable — fail open, allow. */
        FAIL_OPEN,
        /**
         * Linked + metering, but SaaS has been unreachable past the grace window — block (the
         * fail-open backstop expired) so unbounded free/unbilled billable work can't continue.
         */
        GRACE_EXPIRED,
        /**
         * Unlinked and the instance's monthly grant is spent — block until the period rolls. The FE
         * must offer linking as the way to get <em>more</em>, not as the way to switch the feature
         * on: nothing here needed an account to work.
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
