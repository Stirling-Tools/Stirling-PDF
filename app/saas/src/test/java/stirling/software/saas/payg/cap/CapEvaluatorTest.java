package stirling.software.saas.payg.cap;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;

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
    void zeroCap_treatedAsUnlimitedForSafety() {
        // Defensive: a zero cap would divide-by-zero. The guard treats it as null (FULL).
        Evaluation e = CapEvaluator.evaluate(50L, 0L, 80, 100, FeatureSet.MINIMAL);
        assertThat(e.state()).isEqualTo(EntitlementState.FULL);
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
        // MINIMAL = only CLIENT_SIDE survives
        assertThat(e.enabledGates()).containsExactly(FeatureGate.CLIENT_SIDE);
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
    // combineTeamAndMember(): team-wide × member sub-cap combination
    // ---------------------------------------------------------------------------------------

    @Test
    void combine_memberNull_teamEvalWins() {
        Evaluation team = CapEvaluator.evaluate(50L, 100L, 80, 100, FeatureSet.MINIMAL);
        Evaluation combined = CapEvaluator.combineTeamAndMember(team, null);
        assertThat(combined).isSameAs(team);
    }

    @Test
    void combine_memberDegradedButTeamFull_degradesEffectiveResult() {
        Evaluation team = CapEvaluator.evaluate(10L, 100L, 80, 100, FeatureSet.MINIMAL);
        Evaluation member = CapEvaluator.evaluate(50L, 50L, 80, 100, FeatureSet.MINIMAL);

        Evaluation combined = CapEvaluator.combineTeamAndMember(team, member);

        assertThat(combined.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(combined.featureSet()).isEqualTo(FeatureSet.MINIMAL);
        // Intersection of FULL (4 gates) ∩ MINIMAL (CLIENT_SIDE) = CLIENT_SIDE
        assertThat(combined.enabledGates()).containsExactly(FeatureGate.CLIENT_SIDE);
    }

    @Test
    void combine_teamDegradedButMemberFull_stayDegraded() {
        Evaluation team = CapEvaluator.evaluate(100L, 100L, 80, 100, FeatureSet.MINIMAL);
        Evaluation member = CapEvaluator.evaluate(10L, 1000L, 80, 100, FeatureSet.MINIMAL);

        Evaluation combined = CapEvaluator.combineTeamAndMember(team, member);

        assertThat(combined.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(combined.featureSet()).isEqualTo(FeatureSet.MINIMAL);
        assertThat(combined.enabledGates()).containsExactly(FeatureGate.CLIENT_SIDE);
    }

    @Test
    void combine_bothWarned_warnedState_butFullFeatureSet() {
        Evaluation team = CapEvaluator.evaluate(80L, 100L, 80, 100, FeatureSet.MINIMAL);
        Evaluation member = CapEvaluator.evaluate(85L, 100L, 80, 100, FeatureSet.MINIMAL);

        Evaluation combined = CapEvaluator.combineTeamAndMember(team, member);

        assertThat(combined.state()).isEqualTo(EntitlementState.WARNED);
        assertThat(combined.featureSet()).isEqualTo(FeatureSet.FULL);
    }

    @Test
    void combine_bothFull_returnsFull() {
        Evaluation team = CapEvaluator.evaluate(10L, 100L, 80, 100, FeatureSet.MINIMAL);
        Evaluation member = CapEvaluator.evaluate(5L, 50L, 80, 100, FeatureSet.MINIMAL);

        Evaluation combined = CapEvaluator.combineTeamAndMember(team, member);

        assertThat(combined.state()).isEqualTo(EntitlementState.FULL);
        assertThat(combined.featureSet()).isEqualTo(FeatureSet.FULL);
    }

    @Test
    void combine_differentDegradedSets_picksStrictest() {
        // If team policy says degrade-to-MINIMAL and member's hypothetical sub-policy says
        // degrade-to-CLIENT_ONLY, the stricter (CLIENT_ONLY) wins. In practice today member
        // sub-policies use the same set as the team, but the helper is correct in either case.
        Evaluation team = CapEvaluator.evaluate(100L, 100L, 80, 100, FeatureSet.MINIMAL);
        Evaluation member = CapEvaluator.evaluate(100L, 100L, 80, 100, FeatureSet.CLIENT_ONLY);

        Evaluation combined = CapEvaluator.combineTeamAndMember(team, member);

        assertThat(combined.state()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(combined.featureSet()).isEqualTo(FeatureSet.CLIENT_ONLY);
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
    void gatesFor_minimal_clientSideOnly() {
        assertThat(CapEvaluator.gatesFor(FeatureSet.MINIMAL))
                .containsExactly(FeatureGate.CLIENT_SIDE);
    }

    @Test
    void gatesFor_null_returnsEmpty() {
        assertThat(CapEvaluator.gatesFor(null)).isEmpty();
    }

    // ---------------------------------------------------------------------------------------
    // allEnabled(): the entitlement-guard predicate
    // ---------------------------------------------------------------------------------------

    @Test
    void allEnabled_emptyRequired_returnsTrue() {
        assertThat(CapEvaluator.allEnabled(Set.of(), List.of(FeatureGate.CLIENT_SIDE))).isTrue();
        assertThat(CapEvaluator.allEnabled(null, List.of(FeatureGate.CLIENT_SIDE))).isTrue();
    }

    @Test
    void allEnabled_subsetMatches_returnsTrue() {
        assertThat(
                        CapEvaluator.allEnabled(
                                Set.of(FeatureGate.OFFSITE_PROCESSING),
                                List.of(FeatureGate.OFFSITE_PROCESSING, FeatureGate.CLIENT_SIDE)))
                .isTrue();
    }

    @Test
    void allEnabled_missingOneOfMany_returnsFalse() {
        assertThat(
                        CapEvaluator.allEnabled(
                                Set.of(FeatureGate.OFFSITE_PROCESSING, FeatureGate.AI_SUPPORT),
                                List.of(FeatureGate.OFFSITE_PROCESSING)))
                .isFalse();
    }

    @Test
    void allEnabled_nullEnabled_returnsFalseUnlessRequiredEmpty() {
        assertThat(CapEvaluator.allEnabled(Set.of(FeatureGate.OFFSITE_PROCESSING), null)).isFalse();
    }
}
