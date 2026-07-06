package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import stirling.software.proprietary.billing.UnitCalcPolicy;

/**
 * Cached, proprietary-local view of the SaaS {@code GET /api/v1/instance/entitlement} response.
 * Mirrors the saas {@code EntitlementResponse} shape but carries no saas types.
 *
 * <p>The first five fields are what the <b>gate</b> enforces against; the trailing three are the
 * metering inputs (Phase 2) the instance uses to cost + bucket its own usage and reset its
 * per-period counters. The 5-arg constructor builds a gate-only view (metering fields null) for the
 * revoked sentinel and unit tests that don't exercise metering.
 *
 * @param subscribed team has an active subscription
 * @param freeRemainingUnits remaining free-pool units (>0 means free work is available)
 * @param periodSpendUnits paid units spent this period
 * @param periodCapUnits paid cap for the period; {@code null} = uncapped
 * @param state coarse state classification (see {@link EntitlementState})
 * @param unitCalcPolicy doc-unit pricing knobs for local unit computation; {@code null} if not
 *     supplied (older SaaS / gate-only sentinel)
 * @param periodStart inclusive start of the current billing period; {@code null} if not supplied
 * @param periodEnd exclusive end of the current billing period; {@code null} if not supplied
 */
public record InstanceEntitlement(
        boolean subscribed,
        long freeRemainingUnits,
        long periodSpendUnits,
        Long periodCapUnits,
        EntitlementState state,
        UnitCalcPolicy unitCalcPolicy,
        LocalDateTime periodStart,
        LocalDateTime periodEnd) {

    /** Gate-only view with no metering config — used by the revoked sentinel and gate tests. */
    public InstanceEntitlement(
            boolean subscribed,
            long freeRemainingUnits,
            long periodSpendUnits,
            Long periodCapUnits,
            EntitlementState state) {
        this(
                subscribed,
                freeRemainingUnits,
                periodSpendUnits,
                periodCapUnits,
                state,
                null,
                null,
                null);
    }
}
