package stirling.software.proprietary.billing;

/**
 * The four billing knobs the doc-unit math needs, split out of the SaaS {@code PricingPolicy} JPA
 * entity so the calculation ({@link DocumentUnitCalculator}) can live in {@code :proprietary} and
 * be shared by the SaaS billing engine and a linked self-hosted instance — both then cost an
 * operation identically.
 *
 * <p>The SaaS engine builds one from its persisted {@code PricingPolicy}; a linked instance
 * receives these values in the daily entitlement sync. {@code minChargeUnits} is carried here for
 * the charge layer; {@link DocumentUnitCalculator} itself does not apply it (see its docs).
 */
public record UnitCalcPolicy(
        int docPagesPerUnit, long docBytesPerUnit, int minChargeUnits, int fileUnitCap) {

    /**
     * Knobs for an instance with no policy from SaaS — a self-hosted install metering its own free
     * tier before (or without) ever linking. Nothing else can serve as a fallback: the constructor
     * rejects zero on every axis, so there is no inert default to degrade to.
     *
     * <p>Must stay equal to the values SaaS seeds on its default pricing policy, or the same
     * document costs a different number of units before and after linking.
     */
    public static final UnitCalcPolicy DEFAULT = new UnitCalcPolicy(25, 5L * 1024 * 1024, 1, 1000);

    public UnitCalcPolicy {
        if (docPagesPerUnit <= 0) {
            throw new IllegalArgumentException("docPagesPerUnit must be > 0");
        }
        if (docBytesPerUnit <= 0) {
            throw new IllegalArgumentException("docBytesPerUnit must be > 0");
        }
        if (minChargeUnits < 1) {
            throw new IllegalArgumentException("minChargeUnits must be >= 1");
        }
        if (fileUnitCap < 1) {
            throw new IllegalArgumentException("fileUnitCap must be >= 1");
        }
    }
}
