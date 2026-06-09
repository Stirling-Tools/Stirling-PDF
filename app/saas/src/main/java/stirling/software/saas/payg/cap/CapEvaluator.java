package stirling.software.saas.payg.cap;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;

/**
 * Pure-compute cap evaluation. Given a team's (or member's) spend, cap, and warn / degrade
 * thresholds, returns the {@link EntitlementState}, the {@link FeatureSet} that should be in
 * effect, and the corresponding enabled {@link FeatureGate}s. No DB access, no caches — the caller
 * (entitlement service) supplies the inputs.
 *
 * <p>State transitions (matching {@code notes/PAYG_DESIGN.md} §3.6):
 *
 * <ul>
 *   <li>{@code capUnits == null} → {@code FULL} / {@link FeatureSet#FULL} unconditionally.
 *   <li>{@code spend / cap &lt; warnPct} → {@code FULL}.
 *   <li><b>MINIMAL semantics:</b> under DEGRADED+MINIMAL manual server-side tools (gated by {@link
 *       FeatureGate#OFFSITE_PROCESSING}) and client-side tools still work; only {@link
 *       FeatureGate#AUTOMATION} and {@link FeatureGate#AI_SUPPORT} are blocked.
 *   <li>{@code warnPct ≤ spend / cap &lt; degradePct} → {@code WARNED}; feature set still {@link
 *       FeatureSet#FULL} — the warn band is a notification trigger, not a degradation.
 *   <li>{@code spend / cap ≥ degradePct} → {@code DEGRADED}; feature set drops to the policy's
 *       configured {@code degradedFeatureSet} (default {@link FeatureSet#MINIMAL}).
 * </ul>
 *
 * <p>The percentage compare is integer math. We multiply spend by 100 before dividing — this keeps
 * the precision and avoids floating-point on the hot path. Spend × 100 can overflow long at 9.2e16
 * units, which is not a realistic value (would represent quintillions of charged documents); we
 * don't guard against it.
 */
public final class CapEvaluator {

    private CapEvaluator() {}

    /**
     * Snapshot of one cap evaluation. The caller persists this into the appropriate {@code
     * wallet_entitlement_snapshot} row (team-wide or per-member).
     */
    public record Evaluation(
            EntitlementState state, FeatureSet featureSet, List<FeatureGate> enabledGates) {}

    public static Evaluation evaluate(
            long spendUnits,
            Long capUnits,
            int warnAtPct,
            int degradeAtPct,
            FeatureSet degradedFeatureSet) {

        if (capUnits == null || capUnits <= 0) {
            return full();
        }
        if (warnAtPct < 0 || degradeAtPct <= 0 || degradeAtPct < warnAtPct) {
            // Defensive: misconfigured thresholds → treat as no-cap-effect to avoid surprise
            // degradation. The admin endpoints that set the policy should validate; this
            // protects the hot path from a bad row sneaking through.
            return full();
        }

        // pct = floor((spend * 100) / cap). Integer arithmetic on the hot path.
        long pct = (spendUnits * 100L) / capUnits;

        if (pct >= degradeAtPct) {
            FeatureSet effective =
                    degradedFeatureSet != null ? degradedFeatureSet : FeatureSet.MINIMAL;
            return new Evaluation(EntitlementState.DEGRADED, effective, gatesFor(effective));
        }
        if (pct >= warnAtPct) {
            // Warn band: still FULL feature set, but state flag is set so the FE can show a
            // banner / send a notification. The wallet service emits a
            // WalletEntitlementChanged event when state transitions; subscribers (email
            // reminder, SSE to FE) act on that.
            return new Evaluation(
                    EntitlementState.WARNED, FeatureSet.FULL, gatesFor(FeatureSet.FULL));
        }
        return full();
    }

    /**
     * Combine a team-wide evaluation with a member-specific evaluation. The effective gates for a
     * request are the <em>intersection</em> of the two (must be enabled in both), and the effective
     * state is the stricter of the two (DEGRADED &gt; WARNED &gt; FULL). Either side may be {@code
     * null} — if the member has no sub-cap configured, pass null and the team eval wins.
     */
    public static Evaluation combineTeamAndMember(Evaluation team, Evaluation member) {
        if (member == null) {
            return team;
        }
        EntitlementState combinedState = strictest(team.state(), member.state());
        FeatureSet combinedSet =
                combinedState == EntitlementState.DEGRADED
                        ? strictestSet(team.featureSet(), member.featureSet())
                        : FeatureSet.FULL;
        // Intersect enabled gates so a degraded sub-cap can't accidentally let through a
        // gate that the team has lost.
        EnumSet<FeatureGate> intersection = EnumSet.copyOf(team.enabledGates());
        intersection.retainAll(member.enabledGates());
        return new Evaluation(combinedState, combinedSet, List.copyOf(intersection));
    }

    /**
     * Default enabled gates for a given feature set. Kept in sync with the design doc §3.7 mapping
     * table.
     */
    public static List<FeatureGate> gatesFor(FeatureSet set) {
        if (set == null) {
            return List.of();
        }
        return switch (set) {
            case FULL ->
                    List.of(
                            FeatureGate.OFFSITE_PROCESSING,
                            FeatureGate.AUTOMATION,
                            FeatureGate.AI_SUPPORT,
                            FeatureGate.CLIENT_SIDE);
            case MINIMAL -> List.of(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE);
            case CLIENT_ONLY -> List.of(FeatureGate.CLIENT_SIDE);
        };
    }

    private static Evaluation full() {
        return new Evaluation(EntitlementState.FULL, FeatureSet.FULL, gatesFor(FeatureSet.FULL));
    }

    private static EntitlementState strictest(EntitlementState a, EntitlementState b) {
        // Ordinal works here: FULL=0, WARNED=1, DEGRADED=2 in the enum declaration. Higher
        // ordinal = stricter. If that ordering changes, this helper must change too.
        return a.ordinal() >= b.ordinal() ? a : b;
    }

    private static FeatureSet strictestSet(FeatureSet a, FeatureSet b) {
        // FULL=0, MINIMAL=1, CLIENT_ONLY=2 in the enum declaration. Higher ordinal = stricter.
        return a.ordinal() >= b.ordinal() ? a : b;
    }

    /**
     * Helper for the entitlement guard: returns true if all of {@code required} are in {@code
     * enabled}. Used to answer "can this request proceed?".
     */
    public static boolean allEnabled(Set<FeatureGate> required, List<FeatureGate> enabled) {
        if (required == null || required.isEmpty()) {
            return true;
        }
        return enabled != null && enabled.containsAll(required);
    }
}
