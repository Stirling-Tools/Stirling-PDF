package stirling.software.saas.payg.entitlement;

import java.time.LocalDateTime;
import java.util.List;

import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;

/**
 * Immutable snapshot of a team's entitlement state as of a single point in time. Returned by {@link
 * EntitlementService#getSnapshot(Long)} and consumed by {@code EntitlementGuard}.
 *
 * <p>Contrast with {@link WalletEntitlementSnapshot}: the JPA entity is the <em>persisted</em>
 * snapshot that the recompute path writes (one row per team, optionally per member). This record is
 * the <em>computed-now</em> view the hot-path guard reads — backed by a 30s Caffeine cache so a
 * request burst doesn't hammer the ledger SUM.
 *
 * @param state aggregate state — FULL, WARNED, or DEGRADED.
 * @param featureSet bundle name in effect (FULL on no-cap / warn band; degraded set on DEGRADED).
 * @param enabledGates the gates the guard checks against — request proceeds only if every required
 *     gate is in this list.
 * @param periodSpendUnits sum of debited units in {@code [periodStart, periodEnd)}, in canonical
 *     doc-units (positive).
 * @param periodCapUnits the cap applied — free-tier units for un-subscribed teams, {@code
 *     wallet_policy.cap_units} for subscribed teams. {@code null} means uncapped.
 * @param periodStart inclusive start of the current cap period.
 * @param periodEnd exclusive end of the current cap period.
 * @param subscribed whether the team has an active PAYG subscription. Drives the messaging when a
 *     billable call is hard-stopped: an un-subscribed team is told to subscribe; a subscribed team
 *     that hit its self-set spending cap is told to raise it.
 */
public record EntitlementSnapshot(
        EntitlementState state,
        FeatureSet featureSet,
        List<FeatureGate> enabledGates,
        long periodSpendUnits,
        Long periodCapUnits,
        LocalDateTime periodStart,
        LocalDateTime periodEnd,
        boolean subscribed) {

    public boolean isDegraded() {
        return state == EntitlementState.DEGRADED;
    }
}
