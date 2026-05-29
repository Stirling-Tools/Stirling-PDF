package stirling.software.saas.payg.docs;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import stirling.software.saas.payg.policy.PricingPolicy;

/**
 * Computes the doc-unit cost of an uploaded file (or multi-file input) under a given policy.
 *
 * <p>Returns {@code docUnits} with an absolute floor of 1 for non-empty input. {@code
 * policy.minChargeUnits} is applied at charge time, not here.
 */
public interface DocumentClassifier {

    /** Classify a single uploaded file. Returns at least 1 unit, capped at {@code fileUnitCap}. */
    DocumentMetrics classify(MultipartFile file, PricingPolicy policy);

    /**
     * Classify a multi-file input (e.g. a merge or overlay). Returns the sum of each file's raw
     * units, capped at {@code fileUnitCap × files.size()} and floored at 1.
     */
    DocumentMetrics classify(List<MultipartFile> files, PricingPolicy policy);
}
