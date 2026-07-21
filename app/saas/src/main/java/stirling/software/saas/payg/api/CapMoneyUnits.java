package stirling.software.saas.payg.api;

/**
 * Cap conversion between the dollar amount the leader edits in the UI and the unit count stored on
 * {@code wallet_policy.cap_units}.
 *
 * <p>The cap is application-layer only — Stripe stays on a flat-priced single meter, so the
 * conversion rate here doesn't need to match any Stripe price. It only needs to be stable: a leader
 * who set "$25" should read back "$25" on the next page load.
 *
 * <p>V1 rate: {@value #UNITS_PER_USD} units = $1. This anchors the in-app cap representation to the
 * same unit count the ledger writes, so the "X of Y units used" widget in the FE lines up against
 * the cap. A future iteration can read this from {@code pricing_policy} once the per-policy money
 * conversion lands.
 *
 * <p>Both directions floor: $24.50 → 2450 units, 2450 units → $24. The FE only sends whole-dollar
 * inputs (the cap-edit field is an integer text box) so the floor on the read path is the only
 * place rounding ever shows up, and only when an admin set a non-multiple via SQL.
 */
public final class CapMoneyUnits {

    /**
     * Doc-units per USD. {@code 100} = "1 cent per unit" at the in-app display layer. Tied to the
     * unit-count meter the engine writes to the ledger; not tied to Stripe pricing.
     */
    public static final int UNITS_PER_USD = 100;

    /** Smallest currency unit per USD (always 100 cents in USD; explicit for clarity). */
    public static final int CENTS_PER_USD = 100;

    private CapMoneyUnits() {}

    /** Convert a dollar cap entered by the leader to doc-units for {@code cap_units}. */
    public static long usdToUnits(int capUsd) {
        if (capUsd < 0) {
            throw new IllegalArgumentException("capUsd must be >= 0");
        }
        return (long) capUsd * UNITS_PER_USD;
    }

    /** Convert {@code cap_units} back to dollars for the response payload. Floor on read. */
    public static int unitsToUsd(long capUnits) {
        if (capUnits < 0L) {
            return 0;
        }
        return (int) (capUnits / UNITS_PER_USD);
    }

    /** Convert a dollar cap to smallest-currency-unit cents for {@code cap_source_money}. */
    public static long usdToCents(int capUsd) {
        if (capUsd < 0) {
            throw new IllegalArgumentException("capUsd must be >= 0");
        }
        return (long) capUsd * CENTS_PER_USD;
    }
}
