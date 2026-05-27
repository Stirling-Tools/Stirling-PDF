package stirling.software.saas.payg.docs;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import stirling.software.saas.payg.policy.PricingPolicy;

/** Computes the doc-unit cost of an uploaded file (or multi-file input) under a given policy. */
public interface DocumentClassifier {

    /** Classify a single uploaded file. Returns 1 unit minimum, {@code fileUnitCap} maximum. */
    DocumentMetrics classify(MultipartFile file, PricingPolicy policy);

    /**
     * Classify a multi-file input (e.g. a merge or overlay). Returns the sum of each file's units,
     * capped at {@code fileUnitCap × files.size()}.
     */
    DocumentMetrics classify(List<MultipartFile> files, PricingPolicy policy);
}
