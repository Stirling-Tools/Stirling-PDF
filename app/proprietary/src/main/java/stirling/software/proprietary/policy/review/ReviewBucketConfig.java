package stirling.software.proprietary.policy.review;

import java.util.List;

/**
 * A team's review-bucket rules: which classification outcomes hold a source-processed file for
 * human review instead of delivering it. Disabled by default — review is opt-in so automation stays
 * hands-off until a team decides which documents deserve human eyes.
 */
public record ReviewBucketConfig(
        boolean enabled,
        List<String> watchedLabelIds,
        boolean holdFailedRuns,
        boolean holdUnlabeled,
        boolean holdLowConfidence,
        double confidenceThreshold) {

    public ReviewBucketConfig {
        watchedLabelIds = watchedLabelIds == null ? List.of() : List.copyOf(watchedLabelIds);
        // A threshold outside (0, 1] can only be a client bug, and either end is a trap: at 0 no
        // confidence is ever below it so nothing is held, and above 1 every confidence is below it
        // so everything is. Snap to the default rather than silently doing either.
        if (confidenceThreshold <= 0 || confidenceThreshold > 1) {
            confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD;
        }
    }

    public static final double DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

    public static ReviewBucketConfig defaults() {
        return new ReviewBucketConfig(
                false, List.of(), true, false, true, DEFAULT_CONFIDENCE_THRESHOLD);
    }
}
