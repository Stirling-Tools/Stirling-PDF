package stirling.software.proprietary.policy.review.signal;

/**
 * One "how sure was it" number a step attached to a run's output, normalised so the review bucket's
 * low-confidence rule can act on any of them without knowing which tool produced it.
 *
 * @param producer which step produced it, e.g. {@code classification} or {@code OCR}. Shown to the
 *     reviewer verbatim ("Low OCR confidence: page 3"), so pick a short name already cased the way
 *     it should read in a sentence.
 * @param subject what the number is about — a classification label id, a field name, whatever the
 *     producer scopes its confidence to. Null when it describes the document as a whole.
 * @param confidence 0..1, where 1 is certain. Never null: a producer with nothing to say omits the
 *     signal instead.
 * @param detail optional one-line context for the reviewer (the producer's own reasoning).
 */
public record ConfidenceSignal(String producer, String subject, double confidence, String detail) {

    public ConfidenceSignal(String producer, String subject, double confidence) {
        this(producer, subject, confidence, null);
    }
}
