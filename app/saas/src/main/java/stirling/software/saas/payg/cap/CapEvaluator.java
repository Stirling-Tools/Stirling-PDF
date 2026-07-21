package stirling.software.saas.payg.cap;

import java.util.List;

import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;

/**
 * Pure-compute cap evaluation. Given a team's (or member's) spend, cap, and warn / degrade
 * thresholds, returns the {@link EntitlementState}, the {@link FeatureSet} that should be in
 * effect, and the corresponding enabled {@link FeatureGate}s. No DB access, no caches — the caller
 * (entitlement service) supplies the inputs.
 *
 * <p>State transitions:
 *
 * <ul>
 *   <li>{@code capUnits == null} → {@code FULL} / {@link FeatureSet#FULL} (uncapped).
 *   <li>{@code capUnits <= 0} (an explicit $0 cap) → {@code DEGRADED}: metered work blocked, only
 *       the free grant + manual tools run.
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

        if (capUnits == null) {
            // No cap configured → uncapped, full feature set.
            return full();
        }
        if (capUnits <= 0) {
            // An explicit cap that buys zero paid documents (a $0 cap, or one set
            // below the per-document rate): metered work is blocked outright —
            // only the free grant and manual tools run. DEGRADED, same as hitting
            // a positive cap.
            FeatureSet effective =
                    degradedFeatureSet != null ? degradedFeatureSet : FeatureSet.MINIMAL;
            return new Evaluation(EntitlementState.DEGRADED, effective, gatesFor(effective));
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

    /** Default enabled gates for a given feature set. */
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
}
