package stirling.software.saas.payg.entitlement;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.saas.payg.entitlement.WalletEntitlementSnapshot.WalletEntitlementSnapshotId;
import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;

/**
 * Field round-trip + composite-id equality tests for the {@link WalletEntitlementSnapshot} entity.
 * Complements {@code PaygEntitiesSmokeTest} by covering the remaining setters and the full id
 * equality matrix (same ref, null, wrong type, differing components).
 */
class WalletEntitlementSnapshotTest {

    @Test
    @DisplayName("defaults are sensible before any setter runs")
    void defaults() {
        WalletEntitlementSnapshot snap = new WalletEntitlementSnapshot();
        assertThat(snap.getState()).isEqualTo(EntitlementState.FULL);
        assertThat(snap.getFeatureSet()).isEqualTo(FeatureSet.FULL);
        assertThat(snap.getPeriodSpendUnits()).isEqualTo(0L);
        assertThat(snap.getEnabledGates()).isEmpty();
        assertThat(WalletEntitlementSnapshot.TEAM_WIDE_USER_ID).isZero();
    }

    @Test
    @DisplayName("all fields round-trip through their setters")
    void fieldsRoundTrip() {
        WalletEntitlementSnapshot snap = new WalletEntitlementSnapshot();
        WalletEntitlementSnapshotId id = new WalletEntitlementSnapshotId(7L, 42L);
        LocalDateTime start = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime end = LocalDateTime.of(2026, 7, 1, 0, 0);
        LocalDateTime computed = LocalDateTime.of(2026, 6, 15, 12, 0);

        snap.setId(id);
        snap.setPeriodStart(start);
        snap.setPeriodEnd(end);
        snap.setPeriodSpendUnits(99L);
        snap.setPeriodCapUnits(500L);
        snap.setState(EntitlementState.DEGRADED);
        snap.setFeatureSet(FeatureSet.MINIMAL);
        snap.setEnabledGates(List.of(FeatureGate.CLIENT_SIDE));
        snap.setComputedAt(computed);

        assertThat(snap.getId()).isEqualTo(id);
        assertThat(snap.getId().getTeamId()).isEqualTo(7L);
        assertThat(snap.getId().getUserId()).isEqualTo(42L);
        assertThat(snap.getPeriodStart()).isEqualTo(start);
        assertThat(snap.getPeriodEnd()).isEqualTo(end);
        assertThat(snap.getPeriodSpendUnits()).isEqualTo(99L);
        assertThat(snap.getPeriodCapUnits()).isEqualTo(500L);
        assertThat(snap.getState()).isEqualTo(EntitlementState.DEGRADED);
        assertThat(snap.getFeatureSet()).isEqualTo(FeatureSet.MINIMAL);
        assertThat(snap.getEnabledGates()).containsExactly(FeatureGate.CLIENT_SIDE);
        assertThat(snap.getComputedAt()).isEqualTo(computed);
    }

    @Test
    @DisplayName("composite id equality covers ref, null, wrong type, and component diffs")
    void compositeIdEquality() {
        WalletEntitlementSnapshotId id = new WalletEntitlementSnapshotId(7L, 42L);
        assertThat(id).isEqualTo(id); // same reference
        assertThat(id).isNotEqualTo(null);
        assertThat(id).isNotEqualTo("not-an-id");
        assertThat(id).isEqualTo(new WalletEntitlementSnapshotId(7L, 42L));
        assertThat(id).hasSameHashCodeAs(new WalletEntitlementSnapshotId(7L, 42L));
        assertThat(id).isNotEqualTo(new WalletEntitlementSnapshotId(8L, 42L)); // team differs
        assertThat(id).isNotEqualTo(new WalletEntitlementSnapshotId(7L, 43L)); // user differs
    }

    @Test
    @DisplayName("no-arg id ctor leaves components null")
    void noArgIdCtor() {
        WalletEntitlementSnapshotId id = new WalletEntitlementSnapshotId();
        assertThat(id.getTeamId()).isNull();
        assertThat(id.getUserId()).isNull();
    }
}
