package stirling.software.proprietary.policy.review;

/**
 * A label the model weighed seriously but declined to assign — its confidence is how sure the model
 * was that the label applies (deliberately low when it hesitated), with a one-line reason.
 */
public record ConsideredLabel(String labelId, Double confidence, String reason) {}
