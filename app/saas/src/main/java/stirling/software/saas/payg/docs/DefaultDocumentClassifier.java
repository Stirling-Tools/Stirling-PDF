package stirling.software.saas.payg.docs;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Objects;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.policy.PricingPolicy;

/**
 * Reads pages via PDFBox for PDF inputs; treats every other content type as bytes-only.
 *
 * <p>For PDFs, units are the larger of {@code ceil(pages / docPagesPerUnit)} and {@code ceil(bytes
 * / docBytesPerUnit)}. For non-PDFs, only the bytes axis contributes. The result is clamped to
 * {@code [1, policy.fileUnitCap]}.
 *
 * <p>Malformed or encrypted PDFs fall back to bytes-only classification — the file still has a size
 * we can charge against, and the caller decides whether to reject the upload on other grounds.
 */
@Slf4j
@Component
@Profile("saas")
public class DefaultDocumentClassifier implements DocumentClassifier {

    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    @Override
    public DocumentMetrics classify(MultipartFile file, PricingPolicy policy) {
        Objects.requireNonNull(file, "file");
        Objects.requireNonNull(policy, "policy");

        long bytes = file.getSize();
        String contentType =
                file.getContentType() != null ? file.getContentType() : DEFAULT_CONTENT_TYPE;
        int pages = isPdf(contentType, file.getOriginalFilename()) ? readPageCount(file) : 0;

        int units = computeUnits(pages, bytes, policy);
        return new DocumentMetrics(pages, bytes, contentType, units);
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
        long unitsSum = 0;
        String firstContentType = null;

        for (MultipartFile file : files) {
            DocumentMetrics m = classify(file, policy);
            totalPages = saturatedAdd(totalPages, m.pages());
            totalBytes = saturatedAdd(totalBytes, m.bytes());
            unitsSum += m.docUnits();
            if (firstContentType == null) {
                firstContentType = m.contentType();
            }
        }

        long groupCap = (long) policy.fileUnitCap() * files.size();
        int totalUnits = (int) Math.max(1, Math.min(groupCap, unitsSum));

        return new DocumentMetrics(
                totalPages,
                totalBytes,
                firstContentType != null ? firstContentType : DEFAULT_CONTENT_TYPE,
                totalUnits);
    }

    private static int computeUnits(int pages, long bytes, PricingPolicy policy) {
        long pageUnits = pages > 0 ? ceilDiv(pages, policy.docPagesPerUnit()) : 0L;
        long byteUnits = ceilDiv(bytes, policy.docBytesPerUnit());
        long raw = Math.max(pageUnits, byteUnits);
        long clamped = Math.max(1L, Math.min(policy.fileUnitCap(), raw));
        return (int) clamped;
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
     * Reads the page count via PDFBox. Returns 0 if the file can't be parsed — the caller still has
     * a byte-derived unit count, and the upload handler will surface the parse error on its own
     * validation path.
     */
    private static int readPageCount(MultipartFile file) {
        try (InputStream in = file.getInputStream();
                PDDocument document = Loader.loadPDF(in.readAllBytes())) {
            return document.getNumberOfPages();
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
}
