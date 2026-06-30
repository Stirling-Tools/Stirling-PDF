package stirling.software.proprietary.accountlink;

/**
 * Outcome of {@link InstanceEntitlementGate}. {@link #allowed} is what the interceptor enforces;
 * {@link #reason} carries the machine-readable signal the FE maps to a prompt (e.g. "link to
 * activate"). Manual-tool and fail-open allows carry an informational reason but never block.
 */
public record GateDecision(boolean allowed, Reason reason) {

    public enum Reason {
        /** Feature flag is off — gate is fully inert. */
        FLAG_OFF,
        /** Operation is a manual tool — always free, never gated. */
        MANUAL_FREE,
        /** Linked + within entitlement — billable work allowed. */
        ENTITLED,
        /** Entitlement source unreachable — fail open, allow. */
        FAIL_OPEN,
        /** Not linked — block billable work; FE should prompt to link. */
        NOT_LINKED,
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
