package stirling.software.saas.payg.docs;

/**
 * Output of {@link DocumentClassifier#classify}. {@code pages} is {@code 0} for non-PDF inputs.
 *
 * @param pages page count (0 for non-PDFs and for files whose page count couldn't be read)
 * @param bytes raw byte length of the file
 * @param contentType MIME type as reported by the upload, or {@code "application/octet-stream"}
 *     when unknown
 * @param docUnits computed unit cost, clamped to the policy's {@code fileUnitCap}
 */
public record DocumentMetrics(int pages, long bytes, String contentType, int docUnits) {}
