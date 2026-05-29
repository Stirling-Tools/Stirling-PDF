package stirling.software.saas.payg.docs;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import stirling.software.saas.payg.policy.PricingPolicy;

/**
 * Computes the doc-unit cost of an uploaded file (or multi-file input) under a given policy.
 *
 * <p>Implementations return {@code docUnits} — the raw classification result, with an absolute
 * floor of 1 unit for non-empty input so downstream code never needs to special-case "0 units but
 * file is real". <b>The policy-level minimum ({@code policy.minChargeUnits}) is intentionally NOT
 * applied here.</b> Per design § 3.4, the charge formula {@code unitsForProcess =
 * max(policy.min_charge_units, docUnits)} runs at process-open time in {@code JobChargeService}.
 * Applying it at classify time too would double-floor it and break the separation between "what is
 * this file worth?" (classifier) and "what do we actually charge for this process?" (charge
 * service).
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
