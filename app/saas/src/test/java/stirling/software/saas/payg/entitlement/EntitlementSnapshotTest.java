package stirling.software.saas.payg.entitlement;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;

/** Accessor + {@code isDegraded} branch tests for the {@link EntitlementSnapshot} record. */
class EntitlementSnapshotTest {

    private static EntitlementSnapshot snapshot(EntitlementState state) {
        return new EntitlementSnapshot(
                state,
                FeatureSet.FULL,
                List.of(FeatureGate.OFFSITE_PROCESSING, FeatureGate.AI_SUPPORT),
                /* periodSpendUnits= */ 42L,
                /* periodCapUnits= */ 100L,
                LocalDateTime.of(2026, 6, 1, 0, 0),
                LocalDateTime.of(2026, 7, 1, 0, 0),
                /* subscribed= */ true);
    }

    @Test
    @DisplayName("accessors round-trip every component")
    void accessors() {
        EntitlementSnapshot s = snapshot(EntitlementState.WARNED);
        assertThat(s.state()).isEqualTo(EntitlementState.WARNED);
        assertThat(s.featureSet()).isEqualTo(FeatureSet.FULL);
        assertThat(s.enabledGates())
                .containsExactly(FeatureGate.OFFSITE_PROCESSING, FeatureGate.AI_SUPPORT);
        assertThat(s.periodSpendUnits()).isEqualTo(42L);
        assertThat(s.periodCapUnits()).isEqualTo(100L);
        assertThat(s.periodStart()).isEqualTo(LocalDateTime.of(2026, 6, 1, 0, 0));
        assertThat(s.periodEnd()).isEqualTo(LocalDateTime.of(2026, 7, 1, 0, 0));
        assertThat(s.subscribed()).isTrue();
    }

    @Test
    @DisplayName("isDegraded is true only in the DEGRADED state")
    void isDegraded() {
        assertThat(snapshot(EntitlementState.DEGRADED).isDegraded()).isTrue();
        assertThat(snapshot(EntitlementState.FULL).isDegraded()).isFalse();
        assertThat(snapshot(EntitlementState.WARNED).isDegraded()).isFalse();
    }

    @Test
    @DisplayName("a null cap means uncapped and is permitted")
    void nullCapAllowed() {
        EntitlementSnapshot s =
                new EntitlementSnapshot(
                        EntitlementState.FULL,
                        FeatureSet.FULL,
                        List.of(),
                        0L,
                        null,
                        LocalDateTime.now(),
                        LocalDateTime.now().plusDays(1),
                        false);
        assertThat(s.periodCapUnits()).isNull();
        assertThat(s.enabledGates()).isEmpty();
    }

    @Test
    @DisplayName("equal values produce equal records")
    void valueSemantics() {
        assertThat(snapshot(EntitlementState.FULL)).isEqualTo(snapshot(EntitlementState.FULL));
    }
}
