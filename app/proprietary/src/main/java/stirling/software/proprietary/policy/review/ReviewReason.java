package stirling.software.proprietary.policy.review;

import stirling.software.proprietary.policy.review.signal.ClassificationConfidenceSource;
import stirling.software.proprietary.policy.review.signal.ConfidenceSignal;

/**
 * One reason a review item exists. {@code labelId} and {@code confidence} apply to the label-driven
 * kinds; {@code detail} carries free text (the producer's own reasoning for a skipped label or a
 * low confidence, or the error message for a failed run); {@code producer} names the step a
 * confidence came from, so LOW_CONFIDENCE can describe any tool that reports one rather than only
 * the classifier.
 */
public record ReviewReason(
        ReviewReasonKind kind, String labelId, Double confidence, String detail, String producer) {

    public static ReviewReason watchedLabel(String labelId, Double confidence) {
        return new ReviewReason(
                ReviewReasonKind.WATCHED_LABEL,
                labelId,
                confidence,
                null,
                ClassificationConfidenceSource.PRODUCER);
    }

    /**
     * A step reported a confidence under the team's threshold. The signal's subject lands in {@code
     * labelId} — it is a label id for the classifier, and whatever else the producer scoped its
     * number to otherwise (null for a whole-document confidence).
     */
    public static ReviewReason lowConfidence(ConfidenceSignal signal) {
        return new ReviewReason(
                ReviewReasonKind.LOW_CONFIDENCE,
                signal.subject(),
                signal.confidence(),
                signal.detail(),
                signal.producer());
    }

    public static ReviewReason noLabel() {
        return new ReviewReason(ReviewReasonKind.NO_LABEL, null, null, null, null);
    }

    public static ReviewReason skippedLabel(String labelId, Double confidence, String detail) {
        return new ReviewReason(
                ReviewReasonKind.SKIPPED_LABEL,
                labelId,
                confidence,
                detail,
                ClassificationConfidenceSource.PRODUCER);
    }

    public static ReviewReason runFailed(String detail) {
        return new ReviewReason(ReviewReasonKind.RUN_FAILED, null, null, detail, null);
    }
}
