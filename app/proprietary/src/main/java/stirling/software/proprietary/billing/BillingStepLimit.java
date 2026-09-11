package stirling.software.proprietary.billing;

/** Shared fallback for the number of successful tool calls covered by one charge. */
public final class BillingStepLimit {

    private BillingStepLimit() {}

    /** Missing or non-positive limits use 10 steps; no value denotes unlimited steps. */
    public static int resolve(Integer configured) {
        return configured != null && configured > 0 ? configured : 10;
    }
}
