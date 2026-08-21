package stirling.software.saas.payg.cap;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import stirling.software.saas.payg.cap.CapEvaluator.Evaluation;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;

class CapEvaluatorTest {

    // ---------------------------------------------------------------------------------------
    // evaluate(): single-axis cap evaluation
    // ---------------------------------------------------------------------------------------

    @Test
    void nullCap_returnsFullStateAndFullGates() {
        Evaluation e = CapEvaluator.evaluate(1_000_000L, null, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.FULL);
        assertThat(e.featureSet()).isEqualTo(FeatureSet.FULL);
        assertThat(e.enabledGates())
                .containsExactlyInAnyOrder(
                        FeatureGate.OFFSITE_PROCESSING,
                        FeatureGate.AUTOMATION,
                        FeatureGate.AI_SUPPORT,
                        FeatureGate.CLIENT_SIDE);
    }

    @Test
    void zeroCap_blocksMeteredWork() {
        // An explicit $0 cap buys zero paid documents → metered work is blocked
        // (DEGRADED/MINIMAL); only the free grant + manual tools run. (Uncapped is the
        // separate capUnits==null case, covered by nullCap_returnsFullStateAndFullGates.)
        Evaluation e = CapEvaluator.evaluate(50L, 0L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(e.featureSet()).isEqualTo(FeatureSet.MINIMAL);
        assertThat(e.enabledGates())
                .containsExactlyInAnyOrder(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE);
    }

    @Test
    void zeroCap_blocksEvenAtZeroSpend() {
        // A $0 cap blocks from the first metered op — not gated on spend.
        Evaluation e = CapEvaluator.evaluate(0L, 0L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.DEGRADED);
    }

    @Test
    void wellBelowWarn_returnsFull() {
        Evaluation e = CapEvaluator.evaluate(10L, 100L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.FULL);
        assertThat(e.featureSet()).isEqualTo(FeatureSet.FULL);
    }

    @Test
    void exactlyAtWarnThreshold_returnsWarned() {
        // 80% of 100 = 80; pct = 80 / 100 * 100 = 80 → ≥ warnAtPct=80 → WARNED
        Evaluation e = CapEvaluator.evaluate(80L, 100L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.WARNED);
        // Warn band keeps the FULL feature set — only flags the FE to show a banner.
        assertThat(e.featureSet()).isEqualTo(FeatureSet.FULL);
        assertThat(e.enabledGates()).hasSize(4);
    }

    @Test
    void betweenWarnAndDegrade_returnsWarned() {
        Evaluation e = CapEvaluator.evaluate(95L, 100L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.WARNED);
        assertThat(e.featureSet()).isEqualTo(FeatureSet.FULL);
    }

    @Test
    void exactlyAtDegradeThreshold_returnsDegradedWithConfiguredSet() {
        Evaluation e = CapEvaluator.evaluate(100L, 100L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(e.featureSet()).isEqualTo(FeatureSet.MINIMAL);
        // MINIMAL keeps manual server tools (OFFSITE_PROCESSING) + client-side; only
        // AUTOMATION + AI_SUPPORT are blocked.
        assertThat(e.enabledGates())
                .containsExactlyInAnyOrder(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE);
    }

    @Test
    void overDegradeThreshold_returnsDegradedAndCannotEscalate() {
        Evaluation e = CapEvaluator.evaluate(500L, 100L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(e.featureSet()).isEqualTo(FeatureSet.MINIMAL);
    }

    @Test
    void degradedFeatureSetClientOnly_dropsEverythingButClientSide() {
        Evaluation e = CapEvaluator.evaluate(100L, 100L, 80, 100, FeatureSet.CLIENT_ONLY);
        assertThat(e.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(e.featureSet()).isEqualTo(FeatureSet.CLIENT_ONLY);
        assertThat(e.enabledGates()).containsExactly(FeatureGate.CLIENT_SIDE);
    }

    @Test
    void nullDegradedFeatureSet_fallsBackToMinimal() {
        Evaluation e = CapEvaluator.evaluate(100L, 100L, 80, 100, null);
        assertThat(e.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(e.featureSet()).isEqualTo(FeatureSet.MINIMAL);
    }

    @Test
    void misconfiguredThresholds_treatedAsNoCap() {
        // warn > degrade is malformed; the evaluator returns FULL rather than risk wrong
        // degradation. The admin write path is supposed to validate this.
        Evaluation e = CapEvaluator.evaluate(100L, 100L, 110, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.FULL);

        // negative warn → bad config → FULL
        Evaluation neg = CapEvaluator.evaluate(100L, 100L, -10, 100, FeatureSet.MINIMAL);
        assertThat(neg.state()).isEqualTo(EntitlementState.FULL);

        // zero degrade → bad config → FULL (would otherwise degrade on any spend)
        Evaluation zero = CapEvaluator.evaluate(0L, 100L, 80, 0, FeatureSet.MINIMAL);
        assertThat(zero.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void zeroSpend_returnsFullEvenIfCapTiny() {
        Evaluation e = CapEvaluator.evaluate(0L, 1L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.FULL);
    }

    @Test
    void warnAtZeroPct_warnsImmediately() {
        // Edge case: warn-at-0% means any spend → WARNED. Allowed even if quirky.
        Evaluation e = CapEvaluator.evaluate(1L, 100L, 0, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.WARNED);
    }

    // ---------------------------------------------------------------------------------------
    // gatesFor(): mapping FeatureSet → declared gates
    // ---------------------------------------------------------------------------------------

    @Test
    void gatesFor_full_listsAllFour() {
        assertThat(CapEvaluator.gatesFor(FeatureSet.FULL))
                .containsExactlyInAnyOrder(
                        FeatureGate.OFFSITE_PROCESSING,
                        FeatureGate.AUTOMATION,
                        FeatureGate.AI_SUPPORT,
                        FeatureGate.CLIENT_SIDE);
    }

    @Test
    void gatesFor_minimal_keepsOffsiteAndClientSide() {
        // MINIMAL keeps manual server tools (OFFSITE_PROCESSING) + client-side; AUTOMATION +
        // AI_SUPPORT are the only gates dropped on degrade.
        assertThat(CapEvaluator.gatesFor(FeatureSet.MINIMAL))
                .containsExactlyInAnyOrder(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE);
    }

    @Test
    void gatesFor_null_returnsEmpty() {
        assertThat(CapEvaluator.gatesFor(null)).isEmpty();
    }
}
