package stirling.software.proprietary.policy.review;

/**
 * One reason a review item exists. {@code labelId} and {@code confidence} apply to the label-driven
 * kinds; {@code detail} carries free text (the model's own reasoning for a skipped label, or the
 * error message for a failed run).
 */
public record ReviewReason(
        ReviewReasonKind kind, String labelId, Double confidence, String detail) {

    public static ReviewReason watchedLabel(String labelId, Double confidence) {
        return new ReviewReason(ReviewReasonKind.WATCHED_LABEL, labelId, confidence, null);
    }

    public static ReviewReason lowConfidence(String labelId, Double confidence) {
        return new ReviewReason(ReviewReasonKind.LOW_CONFIDENCE, labelId, confidence, null);
    }

    public static ReviewReason noLabel() {
        return new ReviewReason(ReviewReasonKind.NO_LABEL, null, null, null);
    }

    public static ReviewReason skippedLabel(String labelId, Double confidence, String detail) {
        return new ReviewReason(ReviewReasonKind.SKIPPED_LABEL, labelId, confidence, detail);
    }

    public static ReviewReason runFailed(String detail) {
        return new ReviewReason(ReviewReasonKind.RUN_FAILED, null, null, detail);
    }
}
