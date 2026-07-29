package stirling.software.proprietary.policy.review;

import java.time.Instant;
import java.util.List;

import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * One entry in the review bucket: a run whose outputs were held back from delivery (or a failed run
 * flagged for human eyes). Carries everything approval needs to deliver later — the held {@code
 * FileStorage} ids and every {@link OutputSpec} the run was bound for — so releasing a file works
 * even after the in-memory run is gone (worker thread ended, node restarted).
 */
public record ReviewItem(
        String id,
        Long teamId,
        String runId,
        String policyId,
        String policyName,
        ReviewItemStatus status,
        Instant createdAt,
        Instant resolvedAt,
        String resolvedBy,
        List<HeldFile> files,
        List<ReviewReason> reasons,
        List<LabelScore> labels,
        /**
         * Every destination the run would have delivered to, resolved at hold time. A policy can
         * fan out to several, so approving has to release to all of them, not just the first.
         */
        List<OutputSpec> outputs) {

    public ReviewItem {
        files = files == null ? List.of() : List.copyOf(files);
        reasons = reasons == null ? List.of() : List.copyOf(reasons);
        labels = labels == null ? List.of() : List.copyOf(labels);
        outputs = outputs == null ? List.of() : List.copyOf(outputs);
    }

    /**
     * True when {@link #files()} are the run's INPUTS rather than its outputs — the case for a
     * failed run, which never produced outputs. Such files are for inspection only: delivering an
     * unprocessed input would bypass the very policy that failed, so approval must not release
     * them. Derived rather than stored, so persisted items get it for free.
     */
    public boolean filesAreInputs() {
        return reasons.stream().anyMatch(r -> r.kind() == ReviewReasonKind.RUN_FAILED);
    }

    /** This item resolved with the given verdict, stamped now by {@code resolvedBy}. */
    public ReviewItem resolved(ReviewItemStatus verdict, String resolvedBy) {
        return new ReviewItem(
                id,
                teamId,
                runId,
                policyId,
                policyName,
                verdict,
                createdAt,
                Instant.now(),
                resolvedBy,
                files,
                reasons,
                labels,
                outputs);
    }
}
