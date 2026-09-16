package stirling.software.proprietary.policy.engine;

/**
 * Every run in a nonempty source batch has finished its settlement attempt, and at least one
 * completed or failed run settled successfully. Consumers must still check policy quiescence: a
 * failed settlement can leave a claim in flight. Cancellation, queue rejection, or exceptional
 * completion alone does not request more work, preventing immediate resubmission of a batch that
 * made no progress.
 */
public record SourceBatchSettledEvent(String policyId, String sourceId) {}
