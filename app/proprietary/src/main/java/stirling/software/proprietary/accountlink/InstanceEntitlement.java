package stirling.software.proprietary.accountlink;

/**
 * Cached, proprietary-local view of the SaaS {@code GET /api/v1/instance/entitlement} response —
 * just the fields the gate needs. Mirrors the saas {@code EntitlementResponse} shape but carries no
 * saas types.
 *
 * @param subscribed team has an active subscription
 * @param freeRemainingUnits remaining free-pool units (>0 means free work is available)
 * @param periodSpendUnits paid units spent this period
 * @param periodCapUnits paid cap for the period; {@code null} = uncapped
 * @param state coarse state classification (see {@link EntitlementState})
 */
public record InstanceEntitlement(
        boolean subscribed,
        long freeRemainingUnits,
        long periodSpendUnits,
        Long periodCapUnits,
        EntitlementState state) {}
