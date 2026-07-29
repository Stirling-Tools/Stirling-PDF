package stirling.software.proprietary.policy.review;

import java.util.List;

import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Wire projection of a {@link ReviewItem} for the portal. Reduces the internal {@code OutputSpec}s
 * to display labels (the reviewer needs to know where a file goes, not how it gets there);
 * timestamps are epoch millis to match {@code PolicyRunView}.
 */
public record ReviewItemView(
        String id,
        String runId,
        String policyId,
        String policyName,
        ReviewItemStatus status,
        long createdAt,
        Long resolvedAt,
        String resolvedBy,
        List<HeldFile> files,
        List<ReviewReason> reasons,
        List<LabelScore> labels,
        /** Files are the run's unprocessed inputs (the run failed before producing outputs). */
        boolean filesAreInputs,
        /**
         * Every place approval sends the file, e.g. ["Amazon S3 · processed/"]. A policy can fan
         * out, so this is a list; it is never empty (inline delivery reads as "Stirling").
         */
        List<String> destinations) {

    public static ReviewItemView of(ReviewItem item) {
        return new ReviewItemView(
                item.id(),
                item.runId(),
                item.policyId(),
                item.policyName(),
                item.status(),
                item.createdAt().toEpochMilli(),
                item.resolvedAt() == null ? null : item.resolvedAt().toEpochMilli(),
                item.resolvedBy(),
                item.files(),
                item.reasons(),
                item.labels(),
                item.filesAreInputs(),
                destinationsOf(item));
    }

    /** Short human labels for the run's output targets, deduplicated, in order. */
    private static List<String> destinationsOf(ReviewItem item) {
        if (item.outputs().isEmpty()) {
            return List.of(destinationOf(null));
        }
        return item.outputs().stream().map(ReviewItemView::destinationOf).distinct().toList();
    }

    /** Short human label for one output target. */
    private static String destinationOf(OutputSpec output) {
        if (output == null || output.type() == null || "inline".equals(output.type())) {
            return "Stirling";
        }
        return switch (output.type()) {
            case "s3" ->
                    "Amazon S3"
                            + suffix(join(option(output, "bucket"), option(output, "prefix"), "/"));
            case "folder" -> "Folder" + suffix(option(output, "directory"));
            default -> output.type() + suffix(option(output, "directory"));
        };
    }

    private static String option(OutputSpec output, String key) {
        Object value = output.options().get(key);
        return value == null || value.toString().isBlank() ? null : value.toString();
    }

    private static String join(String first, String second, String separator) {
        if (first == null) return second;
        if (second == null) return first;
        return first.endsWith(separator) ? first + second : first + separator + second;
    }

    private static String suffix(String where) {
        return where == null ? "" : " · " + where;
    }
}
