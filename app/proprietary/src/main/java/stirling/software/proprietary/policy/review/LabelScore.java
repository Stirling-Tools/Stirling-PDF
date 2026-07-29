package stirling.software.proprietary.policy.review;

/**
 * A classification label with the model's confidence that it applies. Confidence is null for
 * documents labelled before confidences existed.
 */
public record LabelScore(String labelId, Double confidence) {}
