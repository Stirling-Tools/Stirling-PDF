package stirling.software.saas.payg.policy;

/**
 * Currency-blind unit-calculation parameters used by the document classifier.
 *
 * <p>Holds only the inputs the classifier reads. A future JPA-backed entity can replace this with
 * the same field surface plus persistence + currency + lifecycle metadata.
 *
 * @param docPagesPerUnit pages that map to one doc-unit (e.g. 25 → a 25-page PDF is 1 unit)
 * @param docBytesPerUnit bytes that map to one doc-unit (e.g. 10 MiB)
 * @param minChargeUnits floor charge applied at process-open time (not by the classifier)
 * @param fileUnitCap hard upper bound on units per file, regardless of size or page count
 */
public record PricingPolicy(
        int docPagesPerUnit, long docBytesPerUnit, int minChargeUnits, int fileUnitCap) {

    public PricingPolicy {
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
