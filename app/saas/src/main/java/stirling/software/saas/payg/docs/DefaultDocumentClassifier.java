package stirling.software.saas.payg.docs;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.saas.payg.policy.PricingPolicy;

/**
 * Reads pages via jpdfium for PDF inputs; treats every other content type as bytes-only.
 *
 * <p>For PDFs, units are the larger of {@code ceil(pages / docPagesPerUnit)} and {@code ceil(bytes
 * / docBytesPerUnit)}. For non-PDFs, only the bytes axis contributes. A single file is clamped to
 * {@code [1, policy.fileUnitCap]}; a multi-file group is clamped to {@code [1, policy.fileUnitCap *
 * file_count]} applied to the sum of raw per-file units.
 *
 * <p>Malformed or encrypted PDFs fall back to bytes-only classification — the file still has a size
 * we can charge against, and the caller decides whether to reject the upload on other grounds.
 *
 * <p><b>Where {@code policy.minChargeUnits} is applied.</b> It isn't — not here. Per design § 3.4
 * the charge formula is {@code unitsForProcess = max(policy.min_charge_units, docUnits)} which runs
 * at process-open time inside {@code JobChargeService}. The classifier only enforces an absolute
 * floor of {@link #MIN_UNITS_PER_NONEMPTY_FILE} so callers can rely on "non-empty input → at least
 * 1 unit". Applying {@code minChargeUnits} here too would double-floor.
 *
 * <p><b>Profile-gated to {@code saas}.</b> The classifier is a stateless utility but stays gated
 * with the rest of the {@code :saas} module's beans for consistency — the module is the unit of
 * deployment, not individual beans. When self-hosted PAYG materialises (PR-X1) we can broaden to
 * {@code @Profile({"saas", "selfhosted-payg"})}.
 */
@Slf4j
@Component
@Profile("saas")
@RequiredArgsConstructor
public class DefaultDocumentClassifier implements DocumentClassifier {

    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    /**
     * Absolute floor returned for a non-empty input. Distinct from {@code policy.minChargeUnits},
     * which is applied at charge time (see class javadoc). Without this floor a 0-page 0-byte input
     * would classify as 0 units, breaking the "non-empty input → at least 1 unit" invariant tests
     * and downstream code rely on.
     */
    private static final int MIN_UNITS_PER_NONEMPTY_FILE = 1;

    private final TempFileManager tempFileManager;

    @Override
    public DocumentMetrics classify(MultipartFile file, PricingPolicy policy) {
        Objects.requireNonNull(file, "file");
        Objects.requireNonNull(policy, "policy");

        FileFacts facts = inspect(file);
        long rawUnits = computeRawUnits(facts.pages, facts.bytes, policy);
        // toIntExact rather than (int) cast: a wraparound is a billing bug, not a numerical
        // curiosity. The min() above guarantees we're well inside int range under default
        // fileUnitCap (1000), but the explicit overflow check matches the saturatedAdd care
        // taken everywhere else in this class.
        int units =
                Math.toIntExact(
                        Math.max(
                                MIN_UNITS_PER_NONEMPTY_FILE,
                                Math.min(policy.getFileUnitCap(), rawUnits)));
        return new DocumentMetrics(facts.pages, facts.bytes, facts.contentType, units);
    }

    @Override
    public DocumentMetrics classify(List<MultipartFile> files, PricingPolicy policy) {
        Objects.requireNonNull(files, "files");
        Objects.requireNonNull(policy, "policy");
        if (files.isEmpty()) {
            throw new IllegalArgumentException("files must not be empty");
        }

        int totalPages = 0;
        long totalBytes = 0;
        long rawUnitsSum = 0;
        String firstContentType = null;

        for (MultipartFile file : files) {
            FileFacts facts = inspect(file);
            // Sum the *raw* (unclamped) per-file units so the group cap below can actually bind.
            // Per-file clamping in this loop would make the group cap a no-op.
            rawUnitsSum =
                    saturatedAdd(rawUnitsSum, computeRawUnits(facts.pages, facts.bytes, policy));
            totalPages = saturatedAdd(totalPages, facts.pages);
            totalBytes = saturatedAdd(totalBytes, facts.bytes);
            if (firstContentType == null) {
                firstContentType = facts.contentType;
            }
        }

        long groupCap = (long) policy.getFileUnitCap() * files.size();
        // toIntExact rather than (int) cast — same reasoning as the single-file path. With
        // default fileUnitCap=1000 you'd need ~2.15M files to overflow, which HTTP body limits
        // make impossible, but an explicit failure beats a silent wrap if the limits ever drift.
        int totalUnits =
                Math.toIntExact(
                        Math.max(
                                (long) MIN_UNITS_PER_NONEMPTY_FILE,
                                Math.min(groupCap, rawUnitsSum)));

        return new DocumentMetrics(
                totalPages,
                totalBytes,
                firstContentType != null ? firstContentType : DEFAULT_CONTENT_TYPE,
                totalUnits);
    }

    private FileFacts inspect(MultipartFile file) {
        long bytes = file.getSize();
        String contentType =
                file.getContentType() != null ? file.getContentType() : DEFAULT_CONTENT_TYPE;
        int pages = isPdf(contentType, file.getOriginalFilename()) ? readPageCount(file) : 0;
        return new FileFacts(pages, bytes, contentType);
    }

    private static long computeRawUnits(int pages, long bytes, PricingPolicy policy) {
        long pageUnits = pages > 0 ? ceilDiv(pages, policy.getDocPagesPerUnit()) : 0L;
        long byteUnits = ceilDiv(bytes, policy.getDocBytesPerUnit());
        return Math.max(pageUnits, byteUnits);
    }

    private static long ceilDiv(long numerator, long divisor) {
        if (numerator <= 0) {
            return 0;
        }
        return (numerator + divisor - 1) / divisor;
    }

    private static boolean isPdf(String contentType, String filename) {
        if (PDF_CONTENT_TYPE.equalsIgnoreCase(contentType)) {
            return true;
        }
        return filename != null && filename.toLowerCase().endsWith(".pdf");
    }

    /**
     * Materialises the upload to a managed temp file and asks jpdfium for the page count. Returns 0
     * if the file can't be parsed — the byte-derived axis still produces a charge.
     */
    private int readPageCount(MultipartFile file) {
        try (TempFile temp = tempFileManager.createManagedTempFile(".pdf")) {
            try (InputStream in = file.getInputStream();
                    OutputStream out = Files.newOutputStream(temp.getPath())) {
                in.transferTo(out);
            }
            try (PdfDocument doc = PdfDocument.open(temp.getPath())) {
                return doc.pageCount();
            }
        } catch (IOException | RuntimeException e) {
            log.debug(
                    "Could not read PDF page count for {} ({}); falling back to bytes-only units",
                    file.getOriginalFilename(),
                    e.getClass().getSimpleName());
            return 0;
        }
    }

    private static int saturatedAdd(int a, int b) {
        long sum = (long) a + b;
        if (sum > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }
        return (int) sum;
    }

    private static long saturatedAdd(long a, long b) {
        try {
            return Math.addExact(a, b);
        } catch (ArithmeticException e) {
            return Long.MAX_VALUE;
        }
    }

    private record FileFacts(int pages, long bytes, String contentType) {}
}
