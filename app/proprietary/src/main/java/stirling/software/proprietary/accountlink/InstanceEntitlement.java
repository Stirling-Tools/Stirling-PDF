package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import stirling.software.proprietary.billing.BillingStepLimit;
import stirling.software.proprietary.billing.UnitCalcPolicy;

/**
 * Cached, proprietary-local view of the SaaS {@code GET /api/v1/instance/entitlement} response.
 * Mirrors the saas {@code EntitlementResponse} shape but carries no saas types.
 *
 * <p>The five-argument constructor builds a gate-only view for the revoked sentinel. Older
 * entitlement responses use the shared default automation step limit.
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
 * @param automationStepLimit successful sub-steps covered by one automation charge; non-positive
 *     values use the shared billing default
 */
public record InstanceEntitlement(
        boolean subscribed,
        long freeRemainingUnits,
        long periodSpendUnits,
        Long periodCapUnits,
        EntitlementState state,
        UnitCalcPolicy unitCalcPolicy,
        LocalDateTime periodStart,
        LocalDateTime periodEnd,
        Integer licensedUsers,
        int automationStepLimit) {

    public InstanceEntitlement {
        automationStepLimit = BillingStepLimit.resolve(automationStepLimit);
    }

    /** Entitlement without a supplied automation step limit uses the shared billing default. */
    public InstanceEntitlement(
            boolean subscribed,
            long freeRemainingUnits,
            long periodSpendUnits,
            Long periodCapUnits,
            EntitlementState state,
            UnitCalcPolicy unitCalcPolicy,
            LocalDateTime periodStart,
            LocalDateTime periodEnd,
            Integer licensedUsers) {
        this(
                subscribed,
                freeRemainingUnits,
                periodSpendUnits,
                periodCapUnits,
                state,
                unitCalcPolicy,
                periodStart,
                periodEnd,
                licensedUsers,
                BillingStepLimit.resolve(null));
    }

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
                null,
                null);
    }
}
