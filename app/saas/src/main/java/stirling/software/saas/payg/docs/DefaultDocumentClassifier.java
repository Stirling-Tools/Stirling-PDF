package stirling.software.saas.payg.docs;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
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
 * file_count]} applied to the sum of raw per-file units. Malformed/encrypted PDFs fall back to
 * bytes-only.
 *
 * <p>{@code policy.minChargeUnits} is applied by the charge service, not here. The classifier only
 * enforces an absolute floor of {@link #MIN_UNITS_PER_NONEMPTY_FILE} so callers can rely on
 * "non-empty input → at least 1 unit".
 */
@Slf4j
@Component
@Profile("saas")
@RequiredArgsConstructor
public class DefaultDocumentClassifier implements DocumentClassifier {

    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    /** Floor for non-empty input. Distinct from {@code policy.minChargeUnits} (applied later). */
    private static final int MIN_UNITS_PER_NONEMPTY_FILE = 1;

    private final TempFileManager tempFileManager;

    @Override
    public DocumentMetrics classify(MultipartFile file, PricingPolicy policy) {
        return classify(file, null, policy);
    }

    @Override
    public DocumentMetrics classify(
            MultipartFile file, Path materialisedPath, PricingPolicy policy) {
        Objects.requireNonNull(file, "file");
        Objects.requireNonNull(policy, "policy");

        FileFacts facts = inspect(file, materialisedPath);
        long rawUnits = computeRawUnits(facts.pages, facts.bytes, policy);
        // toIntExact: fail loud on overflow rather than silently wrapping a billing number.
        int units =
                Math.toIntExact(
                        Math.max(
                                MIN_UNITS_PER_NONEMPTY_FILE,
                                Math.min(policy.getFileUnitCap(), rawUnits)));
        return new DocumentMetrics(facts.pages, facts.bytes, facts.contentType, units);
    }

    @Override
    public DocumentMetrics classify(List<MultipartFile> files, PricingPolicy policy) {
        return classify(files, null, policy);
    }

    @Override
    public DocumentMetrics classify(
            List<MultipartFile> files, List<Path> materialisedPaths, PricingPolicy policy) {
        Objects.requireNonNull(files, "files");
        Objects.requireNonNull(policy, "policy");
        if (files.isEmpty()) {
            throw new IllegalArgumentException("files must not be empty");
        }
        if (materialisedPaths != null && materialisedPaths.size() != files.size()) {
            throw new IllegalArgumentException(
                    "materialisedPaths size ("
                            + materialisedPaths.size()
                            + ") must equal files size ("
                            + files.size()
                            + ")");
        }

        int totalPages = 0;
        long totalBytes = 0;
        long rawUnitsSum = 0;
        String firstContentType = null;

        for (int i = 0; i < files.size(); i++) {
            MultipartFile file = files.get(i);
            Path path = materialisedPaths == null ? null : materialisedPaths.get(i);
            FileFacts facts = inspect(file, path);
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
        // toIntExact: fail loud on overflow rather than silently wrapping.
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

    private FileFacts inspect(MultipartFile file, Path materialisedPath) {
        long bytes = file.getSize();
        String contentType =
                file.getContentType() != null ? file.getContentType() : DEFAULT_CONTENT_TYPE;
        int pages = 0;
        if (isPdf(contentType, file.getOriginalFilename())) {
            pages =
                    materialisedPath != null
                            ? readPageCountFromPath(materialisedPath, file.getOriginalFilename())
                            : readPageCount(file);
        }
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
            return readPageCountFromPath(temp.getPath(), file.getOriginalFilename());
        } catch (IOException | RuntimeException e) {
            log.debug(
                    "Could not read PDF page count for {} ({}); falling back to bytes-only units",
                    file.getOriginalFilename(),
                    e.getClass().getSimpleName());
            return 0;
        }
    }

    /**
     * Page-count read against an already-materialised file. Used by callers that already wrote the
     * bytes to disk (the PAYG interceptor materialises every input for the lineage hash) so we
     * avoid a second copy.
     */
    private int readPageCountFromPath(Path path, String displayName) {
        try (PdfDocument doc = PdfDocument.open(path)) {
            return doc.pageCount();
        } catch (RuntimeException e) {
            log.debug(
                    "Could not read PDF page count for {} ({}); falling back to bytes-only units",
                    displayName,
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
