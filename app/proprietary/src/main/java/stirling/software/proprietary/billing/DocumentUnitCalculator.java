package stirling.software.proprietary.billing;

import java.util.List;

/**
 * Pure doc-unit math shared by the SaaS billing engine and a linked self-hosted instance, so both
 * cost an operation identically. No Spring, no IO: callers supply page/byte facts (read however
 * their backend reads them — e.g. jpdfium for PDFs) plus a {@link UnitCalcPolicy}.
 *
 * <p>Raw units for one file = the larger of {@code ceil(pages / docPagesPerUnit)} and {@code
 * ceil(bytes / docBytesPerUnit)} (non-PDF inputs pass {@code pages = 0}, so only the bytes axis
 * contributes). A single file is clamped to {@code [1, fileUnitCap]}; a multi-file group is the
 * <em>raw</em> per-file sum clamped to {@code [1, fileUnitCap * file_count]} (summing raw, not
 * per-file-clamped, units so the group cap can actually bind).
 *
 * <p>{@link UnitCalcPolicy#minChargeUnits()} is applied by the charge layer, not here; this
 * enforces only an absolute floor of {@link #MIN_UNITS_PER_NONEMPTY_FILE} so callers can rely on
 * "non-empty input → at least 1 unit". Extracted verbatim from the SaaS {@code
 * DefaultDocumentClassifier} to preserve behaviour.
 */
public final class DocumentUnitCalculator {

    /** Floor for non-empty input. Distinct from {@link UnitCalcPolicy#minChargeUnits()}. */
    public static final int MIN_UNITS_PER_NONEMPTY_FILE = 1;

    private DocumentUnitCalculator() {}

    /** One file's page count (0 for non-PDF / unreadable) and byte size. */
    public record FileSize(int pages, long bytes) {}

    /** Raw (unclamped) units for one file. */
    public static long rawUnits(int pages, long bytes, UnitCalcPolicy policy) {
        long pageUnits = pages > 0 ? ceilDiv(pages, policy.docPagesPerUnit()) : 0L;
        long byteUnits = ceilDiv(bytes, policy.docBytesPerUnit());
        return Math.max(pageUnits, byteUnits);
    }

    /** Units for a single file, clamped to {@code [1, fileUnitCap]}. */
    public static int unitsForFile(int pages, long bytes, UnitCalcPolicy policy) {
        long raw = rawUnits(pages, bytes, policy);
        // toIntExact: fail loud on overflow rather than silently wrapping a billing number.
        return Math.toIntExact(
                Math.max(MIN_UNITS_PER_NONEMPTY_FILE, Math.min(policy.fileUnitCap(), raw)));
    }

    /**
     * Units for a multi-file group: raw per-file sum clamped to {@code [1, fileUnitCap * count]}.
     */
    public static int unitsForGroup(List<FileSize> files, UnitCalcPolicy policy) {
        if (files.isEmpty()) {
            throw new IllegalArgumentException("files must not be empty");
        }
        long rawSum = 0;
        for (FileSize f : files) {
            rawSum = saturatedAdd(rawSum, rawUnits(f.pages(), f.bytes(), policy));
        }
        long groupCap = (long) policy.fileUnitCap() * files.size();
        return Math.toIntExact(
                Math.max((long) MIN_UNITS_PER_NONEMPTY_FILE, Math.min(groupCap, rawSum)));
    }

    private static long ceilDiv(long numerator, long divisor) {
        if (numerator <= 0) {
            return 0;
        }
        return (numerator + divisor - 1) / divisor;
    }

    private static long saturatedAdd(long a, long b) {
        try {
            return Math.addExact(a, b);
        } catch (ArithmeticException e) {
            return Long.MAX_VALUE;
        }
    }
}
