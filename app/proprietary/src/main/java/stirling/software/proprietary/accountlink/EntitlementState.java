package stirling.software.proprietary.accountlink;

/**
 * Coarse entitlement state the local gate enforces against. Proprietary-local (no coupling to the
 * saas billing module): the SaaS entitlement response is parsed into this minimal shape.
 */
public enum EntitlementState {
    /** Within free pool or covered by an active subscription — billable work allowed. */
    OK,
    /** Free pool exhausted and no subscription / over the period cap — billable work blocked. */
    OVER_LIMIT,
    /**
     * Device credential revoked/invalid on the SaaS side (authoritative 401/403 deny) — billable
     * work blocked. Synthesised locally by {@code EntitlementCache}, never sent by SaaS.
     */
    REVOKED,
    /** Unrecognised/malformed reply — the gate falls back to its numeric checks, not this flag. */
    UNKNOWN
}
