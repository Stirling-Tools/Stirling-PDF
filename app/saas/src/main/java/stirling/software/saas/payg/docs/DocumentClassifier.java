package stirling.software.saas.payg.docs;

import java.nio.file.Path;
import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import stirling.software.saas.payg.policy.PricingPolicy;

/**
 * Computes the doc-unit cost of an uploaded file (or multi-file input) under a given policy.
 *
 * <p>Returns {@code docUnits} with an absolute floor of 1 for non-empty input. {@code
 * policy.minChargeUnits} is applied at charge time, not here.
 *
 * <p>Each overload comes in two flavours:
 *
 * <ul>
 *   <li>{@code classify(MultipartFile, ...)} — classifier reads bytes via {@code getInputStream()}
 *       and writes its own temp file to feed jpdfium (for PDFs). Use when no on-disk copy exists.
 *   <li>{@code classify(MultipartFile, Path, ...)} — caller has already materialised the bytes to
 *       {@code Path}; classifier reads page count directly from there without re-writing. Hot-path
 *       callers (the PAYG interceptor) should use this form since they materialise inputs anyway
 *       for the lineage hash.
 * </ul>
 */
public interface DocumentClassifier {

    /** Classify a single uploaded file. Returns at least 1 unit, capped at {@code fileUnitCap}. */
    DocumentMetrics classify(MultipartFile file, PricingPolicy policy);

    /**
     * Classify a multi-file input (e.g. a merge or overlay). Returns the sum of each file's raw
     * units, capped at {@code fileUnitCap × files.size()} and floored at 1.
     */
    DocumentMetrics classify(List<MultipartFile> files, PricingPolicy policy);

    /**
     * Same as {@link #classify(MultipartFile, PricingPolicy)} but uses {@code materialisedPath} for
     * PDF page-count extraction, avoiding a second copy of the upload bytes to disk. Callers that
     * hold an on-disk copy (e.g. the PAYG interceptor materialises every input for the lineage
     * hash) should prefer this form.
     */
    DocumentMetrics classify(MultipartFile file, Path materialisedPath, PricingPolicy policy);

    /**
     * Multi-file variant of {@link #classify(MultipartFile, Path, PricingPolicy)}. {@code
     * materialisedPaths} must align positionally with {@code files} — entry {@code i} is the
     * on-disk copy of {@code files.get(i)}.
     */
    DocumentMetrics classify(
            List<MultipartFile> files, List<Path> materialisedPaths, PricingPolicy policy);
}
