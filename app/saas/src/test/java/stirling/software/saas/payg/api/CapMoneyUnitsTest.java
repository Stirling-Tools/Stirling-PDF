package stirling.software.saas.payg.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Conversion + validation tests for the {@link CapMoneyUnits} helper. */
class CapMoneyUnitsTest {

    @Test
    @DisplayName("constants expose the V1 rate")
    void constants() {
        assertThat(CapMoneyUnits.UNITS_PER_USD).isEqualTo(100);
        assertThat(CapMoneyUnits.CENTS_PER_USD).isEqualTo(100);
    }

    @Test
    @DisplayName("usdToUnits multiplies by the unit rate")
    void usdToUnits() {
        assertThat(CapMoneyUnits.usdToUnits(0)).isZero();
        assertThat(CapMoneyUnits.usdToUnits(25)).isEqualTo(2500L);
    }

    @Test
    @DisplayName("usdToUnits rejects a negative dollar cap")
    void usdToUnits_rejectsNegative() {
        assertThatThrownBy(() -> CapMoneyUnits.usdToUnits(-1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("capUsd");
    }

    @Test
    @DisplayName("unitsToUsd floors on the read path")
    void unitsToUsd_floors() {
        assertThat(CapMoneyUnits.unitsToUsd(2500L)).isEqualTo(25);
        // 2450 units → $24 (floor), the only place rounding shows up.
        assertThat(CapMoneyUnits.unitsToUsd(2450L)).isEqualTo(24);
        assertThat(CapMoneyUnits.unitsToUsd(99L)).isZero();
    }

    @Test
    @DisplayName("unitsToUsd clamps a negative balance to zero rather than throwing")
    void unitsToUsd_negativeClampsToZero() {
        assertThat(CapMoneyUnits.unitsToUsd(-50L)).isZero();
    }

    @Test
    @DisplayName("usdToCents multiplies by the cents rate")
    void usdToCents() {
        assertThat(CapMoneyUnits.usdToCents(0)).isZero();
        assertThat(CapMoneyUnits.usdToCents(25)).isEqualTo(2500L);
    }

    @Test
    @DisplayName("usdToCents rejects a negative dollar cap")
    void usdToCents_rejectsNegative() {
        assertThatThrownBy(() -> CapMoneyUnits.usdToCents(-1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("capUsd");
    }

    @Test
    @DisplayName("usd→units→usd round-trips for whole-dollar inputs")
    void roundTrips() {
        for (int usd : new int[] {0, 1, 10, 25, 999}) {
            assertThat(CapMoneyUnits.unitsToUsd(CapMoneyUnits.usdToUnits(usd))).isEqualTo(usd);
        }
    }
}
