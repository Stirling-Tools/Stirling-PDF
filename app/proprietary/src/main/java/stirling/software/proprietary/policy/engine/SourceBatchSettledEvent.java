package stirling.software.proprietary.policy.engine;

/**
 * A nonempty source batch has finished its ledger updates with at least one completed or failed
 * file. Cancellation or queue rejection alone does not request more work, preventing immediate
 * resubmission when a batch could not run.
 */
public record SourceBatchSettledEvent(String policyId, String sourceId) {}
